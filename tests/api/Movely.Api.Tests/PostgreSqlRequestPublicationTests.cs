using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Movely.Api.Data;
using Movely.Api.Modules.MoveRequests;
using Movely.Api.Shared.Errors;

namespace Movely.Api.Tests;

[Trait("Category", "PostgreSqlIntegration")]
public sealed class PostgreSqlRequestPublicationTests(PostgreSqlIntegrationFixture fixture) : IClassFixture<PostgreSqlIntegrationFixture>
{
    [SkippableFact]
    public async Task PostgreSqlSharedEligibilityAndRenewalPreserveHistoryAndContent()
    {
        RequireDatabase();
        var original = await SeedMissingCurrentConsent();
        await using var db = fixture.CreateDbContext();
        var before = await db.MoveRequests.AsNoTracking().SingleAsync(x => x.Id == original.Id);
        var history = await db.ContactSharingAcceptances.AsNoTracking().SingleAsync(x => x.MoveRequestId == original.Id);
        var service = RequestPublicationTestData.Service(db);
        var hidden = await service.GetPublicationStatusAsync(original.CustomerUserId, original.Id);
        Assert.Equal(new[] { "CONTACT_SHARING_REQUIRED" }, hidden.Blockers);
        Assert.True(hidden.CanRenewContactSharing);
        Assert.False(await RequestPublicationEligibility.Eligible(db, DateOnly.FromDateTime(DateTime.UtcNow)).AnyAsync(x => x.Id == original.Id));
        var renewed = await service.RenewContactSharingAsync(original.CustomerUserId, original.Id, RequestPublicationTestData.Renew(original));
        Assert.True(renewed.PublicationStatus.EligibleForMarketplace);
        Assert.False(renewed.AlreadyAccepted);
        Assert.True(await RequestPublicationEligibility.Eligible(db, DateOnly.FromDateTime(DateTime.UtcNow)).AnyAsync(x => x.Id == original.Id));
        var repeated = await service.RenewContactSharingAsync(original.CustomerUserId, original.Id, RequestPublicationTestData.Renew(original));
        Assert.True(repeated.AlreadyAccepted);
        Assert.Equal(renewed.PublicationStatus.ContactSharingAcceptedAt, repeated.PublicationStatus.ContactSharingAcceptedAt);
        Assert.Equal(2, await db.MoveRequestVersions.CountAsync(x => x.MoveRequestId == original.Id));
        Assert.Equal(2, await db.ContactSharingAcceptances.CountAsync(x => x.MoveRequestId == original.Id));
        var after = await db.MoveRequests.AsNoTracking().SingleAsync(x => x.Id == original.Id);
        Assert.Equal(before.CurrentVersionId, after.CurrentVersionId);
        Assert.Equal(before.PublishedAt, after.PublishedAt);
        Assert.Equal(before.UpdatedAt, after.UpdatedAt);
        var preserved = await db.ContactSharingAcceptances.AsNoTracking().SingleAsync(x => x.Id == history.Id);
        Assert.Equal(history.DisclosureVersion, preserved.DisclosureVersion);
        Assert.Equal(history.AcceptedAt, preserved.AcceptedAt);
        Assert.False(db.Database.HasPendingModelChanges());
        Assert.True(db.Model.FindEntityType(typeof(Movely.Api.Data.Entities.MoveRequest))!.FindProperty("CustomerUserId")!.IsConcurrencyToken);
    }

    [SkippableFact]
    public async Task FailedRenewalAfterSqlWritesRollsBackConsentAndParentTogether()
    {
        RequireDatabase();
        var original = await SeedMissingCurrentConsent();
        await using (var db = With(new RejectAfterSave()))
            await Assert.ThrowsAsync<InvalidOperationException>(() => RequestPublicationTestData.Service(db)
                .RenewContactSharingAsync(original.CustomerUserId, original.Id, RequestPublicationTestData.Renew(original)));
        await using var verify = fixture.CreateDbContext();
        Assert.Equal(1, await verify.ContactSharingAcceptances.CountAsync(x => x.MoveRequestId == original.Id));
        Assert.Equal(2, await verify.MoveRequestVersions.CountAsync(x => x.MoveRequestId == original.Id));
        var status = await RequestPublicationTestData.Service(verify).GetPublicationStatusAsync(original.CustomerUserId, original.Id);
        Assert.True(status.CanRenewContactSharing);
        Assert.False(status.HasCurrentContactSharing);
    }

    [SkippableFact]
    public async Task ConcurrentRenewalsStoreOnlyOneCurrentAcceptanceAndReturnControlledConflict()
    {
        RequireDatabase();
        var original = await SeedMissingCurrentConsent();
        var barrier = new BothWritesReady();
        await using var first = With(barrier);
        await using var second = With(barrier);
        var results = await Task.WhenAll(
            Capture(RequestPublicationTestData.Service(first).RenewContactSharingAsync(original.CustomerUserId, original.Id, RequestPublicationTestData.Renew(original))),
            Capture(RequestPublicationTestData.Service(second).RenewContactSharingAsync(original.CustomerUserId, original.Id, RequestPublicationTestData.Renew(original))));
        Assert.Single(results, x => x is null);
        var conflict = Assert.Single(results, x => x is not null)!;
        Assert.Equal("REQUEST_VERSION_CONFLICT", conflict.ErrorCode);
        Assert.Equal(409, conflict.StatusCode);
        await using var verify = fixture.CreateDbContext();
        Assert.Equal(2, await verify.ContactSharingAcceptances.CountAsync(x => x.MoveRequestId == original.Id));
        Assert.Equal(2, await verify.MoveRequestVersions.CountAsync(x => x.MoveRequestId == original.Id));
        var repeated = await RequestPublicationTestData.Service(verify).RenewContactSharingAsync(original.CustomerUserId, original.Id, RequestPublicationTestData.Renew(original));
        Assert.True(repeated.AlreadyAccepted);
    }

    [SkippableTheory]
    [InlineData("version", false)]
    [InlineData("status", false)]
    [InlineData("sales", false)]
    [InlineData("limit", false)]
    [InlineData("buyers", false)]
    [InlineData("owner", false)]
    [InlineData("status", true)]
    [InlineData("owner", true)]
    public async Task ForcedParentUpdateRejectsConcurrentChangesIncludingIdempotentFixedClockCalls(string change, bool alreadyAccepted)
    {
        RequireDatabase();
        var original = await SeedMissingCurrentConsent();
        if (alreadyAccepted) {
            await using var setup = fixture.CreateDbContext();
            await RequestPublicationTestData.Service(setup).RenewContactSharingAsync(original.CustomerUserId, original.Id, RequestPublicationTestData.Renew(original));
        }
        var pause = new PausedWrite();
        await using var losingDb = With(pause);
        var pending = RequestPublicationTestData.Service(losingDb, original.UpdatedAt)
            .RenewContactSharingAsync(original.CustomerUserId, original.Id, RequestPublicationTestData.Renew(original));
        await pause.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
        try {
            await using var writer = fixture.CreateDbContext();
            if (change == "version") {
                await ActiveRequestTestData.Service(writer).UpdateOwnedAsync(original.CustomerUserId, original.Id, ActiveRequestTestData.Update(original));
            } else {
                var row = (await writer.MoveRequests.FindAsync(original.Id))!;
                switch (change) {
                    case "status": row.Status = MoveRequestStatus.Closed; row.LeadSalesStatus = LeadSalesStatus.Closed; break;
                    case "sales": row.LeadSalesStatus = LeadSalesStatus.Closed; break;
                    case "limit": row.MaxLeadBuyers++; break;
                    case "buyers": row.ActiveBuyerCount++; break;
                    case "owner": row.CustomerUserId = (await BusinessTestData.User(writer)).Id; break;
                }
                await writer.SaveChangesAsync();
            }
        } finally { pause.Release.TrySetResult(); }
        var conflict = await Assert.ThrowsAsync<ApiException>(() => pending);
        Assert.Equal("REQUEST_VERSION_CONFLICT", conflict.ErrorCode);
        Assert.Equal(409, conflict.StatusCode);
        await using var verify = fixture.CreateDbContext();
        Assert.Equal((alreadyAccepted || change == "version") ? 2 : 1, await verify.ContactSharingAcceptances.CountAsync(x => x.MoveRequestId == original.Id));
        Assert.Equal(change == "version" ? 3 : 2, await verify.MoveRequestVersions.CountAsync(x => x.MoveRequestId == original.Id));
        if (change == "version") {
            var current = await verify.MoveRequests.AsNoTracking().SingleAsync(x => x.Id == original.Id);
            Assert.NotEqual(original.CurrentVersion!.Id, current.CurrentVersionId);
            Assert.True(await verify.ContactSharingAcceptances.AnyAsync(x => x.RequestVersionId == current.CurrentVersionId));
        }
    }

    private async Task<MoveRequestResponse> SeedMissingCurrentConsent()
    {
        await using var db = fixture.CreateDbContext();
        var original = await ActiveRequestTestData.CreatePublishedAsync(db);
        var old = await db.ContactSharingAcceptances.SingleAsync(x => x.MoveRequestId == original.Id);
        old.DisclosureVersion = "historical-reviewed-disclosure";
        await db.SaveChangesAsync();
        return original;
    }
    private void RequireDatabase() => Skip.IfNot(fixture.IsConfigured, "Set MOVELY_TEST_POSTGRES_CONNECTION_STRING to verify publication renewal transactions.");
    private MovelyDbContext With(SaveChangesInterceptor interceptor) => new(new DbContextOptionsBuilder<MovelyDbContext>().UseNpgsql(fixture.ConnectionString).AddInterceptors(interceptor).Options);
    private static async Task<ApiException?> Capture(Task operation) { try { await operation; return null; } catch (ApiException error) { return error; } }
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
            => throw new InvalidOperationException("Deliberate post-SQL failure to verify consent renewal rollback.");
    }
}
