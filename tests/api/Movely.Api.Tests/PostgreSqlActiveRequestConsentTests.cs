using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Modules.MoveRequests;
using Movely.Api.Shared.Errors;

namespace Movely.Api.Tests;

[Trait("Category", "PostgreSqlIntegration")]
public sealed class PostgreSqlActiveRequestConsentTests(PostgreSqlIntegrationFixture fixture) : IClassFixture<PostgreSqlIntegrationFixture>
{
    [SkippableFact]
    public async Task VersionedConsentMigrationPreservesHistoryAndAllowsFuturePolicyReacceptance()
    {
        RequireDatabase();
        await using var db = fixture.CreateDbContext();
        Assert.Contains(await db.Database.GetAppliedMigrationsAsync(), x => x.EndsWith("_BindContactSharingToRequestVersions"));
        Assert.False(db.Database.HasPendingModelChanges());
        var original = await ActiveRequestTestData.CreatePublishedAsync(db);
        var updated = await ActiveRequestTestData.Service(db).UpdateOwnedAsync(original.CustomerUserId, original.Id, ActiveRequestTestData.Update(original));
        Assert.Equal(2, await db.ContactSharingAcceptances.CountAsync(x => x.MoveRequestId == original.Id));
        var current = await db.ContactSharingAcceptances.AsNoTracking().SingleAsync(x => x.RequestVersionId == updated.CurrentVersion!.Id);
        foreach (var variant in new[] { "disclosure", "limit", "environment" })
            db.ContactSharingAcceptances.Add(new ContactSharingAcceptance {
                Id = Guid.NewGuid(), UserId = current.UserId, MoveRequestId = current.MoveRequestId,
                RequestVersionId = current.RequestVersionId, AcceptedAt = DateTimeOffset.UtcNow,
                DisclosureVersion = variant == "disclosure" ? "future-reviewed-version" : current.DisclosureVersion,
                MaxRecipients = variant == "limit" ? current.MaxRecipients + 1 : current.MaxRecipients,
                IsTestOnly = variant == "environment" ? !current.IsTestOnly : current.IsTestOnly,
            });
        await db.SaveChangesAsync();
        Assert.Equal(5, await db.ContactSharingAcceptances.CountAsync(x => x.MoveRequestId == original.Id));
    }

    [SkippableFact]
    public async Task FailureAfterWritingVersionAndConsentRollsBackTheWholeActiveUpdate()
    {
        RequireDatabase();
        MoveRequestResponse original;
        await using (var setup = fixture.CreateDbContext()) original = await ActiveRequestTestData.CreatePublishedAsync(setup);
        await using (var db = CreateDb(new RejectAfterSave()))
            await Assert.ThrowsAsync<InvalidOperationException>(() => ActiveRequestTestData.Service(db)
                .UpdateOwnedAsync(original.CustomerUserId, original.Id, ActiveRequestTestData.Update(original)));
        await AssertUnchangedAsync(original);
    }

    [SkippableFact]
    public async Task ConcurrentActiveUpdatesProduceOneVersionAndOneFreshConsentAndReturnDomainConflict()
    {
        RequireDatabase();
        MoveRequestResponse original;
        await using (var setup = fixture.CreateDbContext()) original = await ActiveRequestTestData.CreatePublishedAsync(setup);
        var barrier = new BothWritesReady();
        await using var first = CreateDb(barrier);
        await using var second = CreateDb(barrier);
        var results = await Task.WhenAll(
            Capture(ActiveRequestTestData.Service(first).UpdateOwnedAsync(original.CustomerUserId, original.Id,
                ActiveRequestTestData.Update(original) with { CustomerComment = "First writer" })),
            Capture(ActiveRequestTestData.Service(second).UpdateOwnedAsync(original.CustomerUserId, original.Id,
                ActiveRequestTestData.Update(original) with { CustomerComment = "Second writer" })));
        var winner = Assert.Single(results, x => x.Response is not null).Response!;
        var conflict = Assert.Single(results, x => x.Error is not null).Error!;
        Assert.Equal("REQUEST_VERSION_CONFLICT", conflict.ErrorCode);
        Assert.Equal(409, conflict.StatusCode);
        await using var verify = fixture.CreateDbContext();
        Assert.Equal(winner.CurrentVersion!.Id, (await verify.MoveRequests.FindAsync(original.Id))!.CurrentVersionId);
        Assert.Equal(3, await verify.MoveRequestVersions.CountAsync(x => x.MoveRequestId == original.Id));
        Assert.Equal(2, await verify.ContactSharingAcceptances.CountAsync(x => x.MoveRequestId == original.Id));
        Assert.True(await verify.ContactSharingAcceptances.AnyAsync(x => x.RequestVersionId == winner.CurrentVersion.Id));
        Assert.True(await verify.ContactSharingAcceptances.AnyAsync(x => x.RequestVersionId == original.CurrentVersion!.Id));
    }

    [SkippableTheory]
    [InlineData("status")]
    [InlineData("sales")]
    [InlineData("limit")]
    [InlineData("buyers")]
    public async Task ConcurrentAggregateChangeRejectsStaleActiveUpdateWithoutPartialConsent(string change)
    {
        RequireDatabase();
        MoveRequestResponse original;
        await using (var setup = fixture.CreateDbContext()) original = await ActiveRequestTestData.CreatePublishedAsync(setup);
        var pause = new PausedWrite();
        await using var losingDb = CreateDb(pause);
        var update = ActiveRequestTestData.Service(losingDb).UpdateOwnedAsync(original.CustomerUserId, original.Id, ActiveRequestTestData.Update(original));
        await pause.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
        try
        {
            await using var writer = fixture.CreateDbContext();
            var request = (await writer.MoveRequests.FindAsync(original.Id))!;
            switch (change)
            {
                case "status": request.Status = MoveRequestStatus.Cancelled; request.LeadSalesStatus = LeadSalesStatus.Closed; break;
                case "sales": request.LeadSalesStatus = LeadSalesStatus.SoldOut; break;
                case "limit": request.MaxLeadBuyers++; break;
                case "buyers": request.ActiveBuyerCount++; break;
            }
            await writer.SaveChangesAsync();
        }
        finally { pause.Release.TrySetResult(); }
        var error = await Assert.ThrowsAsync<ApiException>(() => update);
        Assert.Equal("REQUEST_VERSION_CONFLICT", error.ErrorCode);
        Assert.Equal(409, error.StatusCode);
        await AssertUnchangedAsync(original);
    }

    [SkippableTheory]
    [InlineData("cancel")]
    [InlineData("close")]
    [InlineData("publish")]
    public async Task ExistingLifecycleCommandsReturnConflictWhenTheirVersionBecomesStale(string action)
    {
        RequireDatabase();
        MoveRequestResponse original;
        await using (var setup = fixture.CreateDbContext())
        {
            original = await ActiveRequestTestData.CreatePublishedAsync(setup);
            if (action == "publish")
            {
                var service = ActiveRequestTestData.Service(setup);
                var draft = await service.CreateDraftAsync(original.CustomerUserId, new CreateMoveRequestRequest(MoveRequestType.SmallMove));
                original = await service.UpdateOwnedAsync(original.CustomerUserId, draft.Id, ActiveRequestTestData.Update());
            }
        }
        var pause = new PausedWrite();
        await using var losingDb = CreateDb(pause);
        var losing = ActiveRequestTestData.Service(losingDb);
        Task pending = action switch {
            "cancel" => losing.CancelOwnedAsync(original.CustomerUserId, original.Id),
            "close" => losing.CloseOwnedAsync(original.CustomerUserId, original.Id),
            _ => losing.PublishOwnedAsync(original.CustomerUserId, original.Id, ConsentFixtures.Sharing),
        };
        await pause.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
        MoveRequestResponse winner;
        try
        {
            await using var writer = fixture.CreateDbContext();
            winner = await ActiveRequestTestData.Service(writer).UpdateOwnedAsync(original.CustomerUserId, original.Id, ActiveRequestTestData.Update(original));
        }
        finally { pause.Release.TrySetResult(); }
        var error = await Assert.ThrowsAsync<ApiException>(() => pending);
        Assert.Equal(409, error.StatusCode);
        Assert.Equal("REQUEST_VERSION_CONFLICT", error.ErrorCode);
        await using var verify = fixture.CreateDbContext();
        var stored = (await verify.MoveRequests.FindAsync(original.Id))!;
        Assert.Equal(winner.CurrentVersion!.Id, stored.CurrentVersionId);
        Assert.Equal(original.Status, stored.Status);
        Assert.Equal(action == "publish" ? 0 : 2, await verify.ContactSharingAcceptances.CountAsync(x => x.MoveRequestId == original.Id));
    }

    private async Task AssertUnchangedAsync(MoveRequestResponse original)
    {
        await using var verify = fixture.CreateDbContext();
        Assert.Equal(original.CurrentVersion!.Id, (await verify.MoveRequests.FindAsync(original.Id))!.CurrentVersionId);
        Assert.Equal(2, await verify.MoveRequestVersions.CountAsync(x => x.MoveRequestId == original.Id));
        var acceptance = await verify.ContactSharingAcceptances.SingleAsync(x => x.MoveRequestId == original.Id);
        Assert.Equal(original.CurrentVersion.Id, acceptance.RequestVersionId);
    }

    private static async Task<(MoveRequestResponse? Response, ApiException? Error)> Capture(Task<MoveRequestResponse> update)
    {
        try { return (await update, null); }
        catch (ApiException error) { return (null, error); }
    }

    private MovelyDbContext CreateDb(SaveChangesInterceptor interceptor) => new(new DbContextOptionsBuilder<MovelyDbContext>()
        .UseNpgsql(fixture.ConnectionString).AddInterceptors(interceptor).Options);
    private void RequireDatabase() => Skip.IfNot(fixture.IsConfigured, "Set MOVELY_TEST_POSTGRES_CONNECTION_STRING for PostgreSQL integration tests.");

    private sealed class BothWritesReady : SaveChangesInterceptor
    {
        private int _arrivals;
        private readonly TaskCompletionSource _ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (Interlocked.Increment(ref _arrivals) == 2) _ready.TrySetResult();
            await _ready.Task.WaitAsync(TimeSpan.FromSeconds(10), cancellationToken);
            return result;
        }
    }

    private sealed class PausedWrite : SaveChangesInterceptor
    {
        public TaskCompletionSource Entered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            Entered.TrySetResult();
            await Release.Task.WaitAsync(TimeSpan.FromSeconds(10), cancellationToken);
            return result;
        }
    }

    private sealed class RejectAfterSave : SaveChangesInterceptor
    {
        public override ValueTask<int> SavedChangesAsync(SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
            => throw new InvalidOperationException("Deliberate failure after SQL writes to verify transaction rollback.");
    }
}
