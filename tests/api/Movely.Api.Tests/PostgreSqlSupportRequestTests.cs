using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Movely.Api.Data;
using Movely.Api.Modules.Support;
using Movely.Api.Shared.Errors;
using Npgsql;

namespace Movely.Api.Tests;

[Trait("Category", "PostgreSqlIntegration")]
public sealed class PostgreSqlSupportRequestTests(PostgreSqlIntegrationFixture fixture) : IClassFixture<PostgreSqlIntegrationFixture>
{
    [SkippableTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ConcurrentCreateUsesOwnerScopedIdempotencyAndRejectsChangedContent(bool differentPayload)
    {
        RequireDatabase();
        await fixture.ResetAsync();
        Guid ownerId;
        await using (var setup = fixture.CreateDbContext()) ownerId = (await BusinessTestData.User(setup, phone: false, consent: false)).Id;
        var command = SupportTestData.Create(ownerId);
        var barrier = new BothWritesReady();
        await using var first = With(barrier);
        await using var second = With(barrier);
        var outcomes = await Task.WhenAll(
            Capture(SupportTestData.Service(first).CreateAsync(ownerId, command)),
            Capture(SupportTestData.Service(second).CreateAsync(ownerId, differentPayload ? command with { Message = "Different original message" } : command)));
        var fresh = Assert.Single(outcomes, x => x.Value is { AlreadyCreated: false }).Value!;
        if (differentPayload) Assert.Equal("SUPPORT_IDEMPOTENCY_CONFLICT", Assert.Single(outcomes, x => x.Error is not null).Error!.ErrorCode);
        else {
            Assert.All(outcomes, x => Assert.Null(x.Error));
            Assert.Single(outcomes, x => x.Value!.AlreadyCreated);
            Assert.All(outcomes, x => Assert.Equal(fresh.Request.Id, x.Value!.Request.Id));
        }
        await using var verify = fixture.CreateDbContext();
        Assert.Single(await verify.SupportRequests.ToListAsync());
        Assert.Equal(Assert.Single(fresh.Request.History.Items).Body, (await verify.SupportRequestEvents.SingleAsync()).Body);
        var other = await BusinessTestData.User(verify, phone: false, consent: false);
        var separate = await SupportTestData.Service(verify).CreateAsync(other.Id, command with { ExpectedActorUserId = other.Id });
        Assert.NotEqual(fresh.Request.Id, separate.Request.Id);
        Assert.Equal(2, await verify.SupportRequests.CountAsync());
    }

    [SkippableTheory]
    [InlineData("create")]
    [InlineData("reply")]
    [InlineData("status")]
    [InlineData("cancel")]
    public async Task FailureAfterSqlWritesRollsBackParentAndEntireHistory(string action)
    {
        RequireDatabase();
        var (owner, admin, original) = await Seed();
        await using (var failed = With(new RejectAfterSave())) {
            var service = SupportTestData.Service(failed);
            Task operation = action switch {
                "create" => service.CreateAsync(owner, SupportTestData.Create(owner)),
                "reply" => service.ReplyOwnedAsync(owner, original.Id, new(Guid.NewGuid(), original.RevisionId, "Must not survive rollback", owner)),
                "status" => service.SetStatusAdminAsync(admin, original.Id, new(Guid.NewGuid(), original.RevisionId, SupportRequestStatus.InReview, admin)),
                _ => service.CancelOwnedAsync(owner, original.Id, new(Guid.NewGuid(), original.RevisionId, owner)),
            };
            await Assert.ThrowsAsync<InvalidOperationException>(() => operation);
        }
        await using var verify = fixture.CreateDbContext();
        var saved = await verify.SupportRequests.SingleAsync();
        Assert.Equal(original.RevisionId, saved.RevisionId);
        Assert.Equal(SupportRequestStatus.Open, saved.Status);
        Assert.Equal(1, saved.LastSequenceNumber);
        Assert.Equal(original.UpdatedAt, saved.UpdatedAt);
        Assert.Single(await verify.SupportRequestEvents.ToListAsync());
    }

    [SkippableTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ConcurrentReplyWithSameMutationIsOneEventOrConflictForChangedPayload(bool differentPayload)
    {
        RequireDatabase();
        var (owner, _, original) = await Seed();
        var barrier = new BothWritesReady();
        await using var first = With(barrier);
        await using var second = With(barrier);
        var command = new SupportReplyRequest(Guid.NewGuid(), original.RevisionId, "Concurrent reply", owner);
        var outcomes = await Task.WhenAll(
            Capture(SupportTestData.Service(first).ReplyOwnedAsync(owner, original.Id, command)),
            Capture(SupportTestData.Service(second).ReplyOwnedAsync(owner, original.Id, differentPayload ? command with { Body = "Different reply" } : command)));
        var fresh = Assert.Single(outcomes, x => x.Value is { AlreadyApplied: false }).Value!;
        if (differentPayload) Assert.Equal("SUPPORT_IDEMPOTENCY_CONFLICT", Assert.Single(outcomes, x => x.Error is not null).Error!.ErrorCode);
        else {
            Assert.All(outcomes, x => Assert.Null(x.Error));
            Assert.Single(outcomes, x => x.Value!.AlreadyApplied);
            Assert.All(outcomes, x => Assert.Equal(fresh.EventId, x.Value!.EventId));
        }
        await using var verify = fixture.CreateDbContext();
        var row = await verify.SupportRequests.SingleAsync();
        Assert.Equal(fresh.Request.RevisionId, row.RevisionId);
        Assert.Equal(2, row.LastSequenceNumber);
        var events = await verify.SupportRequestEvents.OrderBy(x => x.SequenceNumber).ToListAsync();
        Assert.Equal(2, events.Count);
        Assert.Equal(original.RevisionId, events[1].ExpectedRevisionId);
        Assert.Equal(row.RevisionId, events[1].RevisionId);
        Assert.Equal(fresh.EventId, events[1].Id);
        Assert.Equal(original.History.Items[0].Body, events[0].Body);
    }

    [SkippableTheory]
    [InlineData("cancel")]
    [InlineData("status")]
    [InlineData("reply")]
    public async Task DifferentCommandsOfOneRevisionCommitExactlyOneEvent(string competitor)
    {
        RequireDatabase();
        var (owner, admin, original) = await Seed();
        var barrier = new BothWritesReady();
        await using var first = With(barrier);
        await using var second = With(barrier);
        var firstTask = CaptureTask(SupportTestData.Service(first).ReplyOwnedAsync(owner, original.Id, new(Guid.NewGuid(), original.RevisionId, "Owner message", owner)));
        var service = SupportTestData.Service(second);
        Task operation = competitor switch {
            "cancel" => service.CancelOwnedAsync(owner, original.Id, new(Guid.NewGuid(), original.RevisionId, owner)),
            "status" => service.SetStatusAdminAsync(admin, original.Id, new(Guid.NewGuid(), original.RevisionId, SupportRequestStatus.InReview, admin)),
            _ => service.ReplyAdminAsync(admin, original.Id, new(Guid.NewGuid(), original.RevisionId, "Support response", SupportRequestStatus.WaitingForUser, admin)),
        };
        var outcomes = await Task.WhenAll(firstTask, CaptureTask(operation));
        Assert.Single(outcomes, x => x is null);
        var error = Assert.Single(outcomes, x => x is not null)!;
        Assert.Equal("SUPPORT_REVISION_CONFLICT", error.ErrorCode);
        Assert.Equal(409, error.StatusCode);
        await using var verify = fixture.CreateDbContext();
        var row = await verify.SupportRequests.SingleAsync();
        Assert.Equal(2, row.LastSequenceNumber);
        var history = await verify.SupportRequestEvents.OrderBy(x => x.SequenceNumber).ToListAsync();
        Assert.Equal(2, history.Count);
        Assert.Equal(row.RevisionId, history[1].RevisionId);
        Assert.Equal(row.Status, history[1].Status);
        Assert.Equal(original.RevisionId, history[1].ExpectedRevisionId);
    }

    [SkippableTheory]
    [InlineData("owner")]
    [InlineData("status")]
    [InlineData("revision")]
    public async Task OutOfBandParentChangesCannotBeOverwrittenByAnInFlightReply(string change)
    {
        RequireDatabase();
        var (owner, _, original) = await Seed();
        var pause = new PausedWrite();
        await using var blocked = With(pause);
        var pending = SupportTestData.Service(blocked).ReplyOwnedAsync(owner, original.Id, new(Guid.NewGuid(), original.RevisionId, "Losing private reply", owner));
        await pause.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
        var replacementRevision = Guid.NewGuid();
        Guid? replacementOwner = null;
        try {
            await using var writer = fixture.CreateDbContext();
            var row = (await writer.SupportRequests.FindAsync(original.Id))!;
            if (change == "owner") { replacementOwner = (await BusinessTestData.User(writer)).Id; row.OwnerUserId = replacementOwner.Value; }
            else if (change == "status") row.Status = SupportRequestStatus.Cancelled;
            else row.RevisionId = replacementRevision;
            await writer.SaveChangesAsync();
        } finally { pause.Release.TrySetResult(); }
        var error = await Assert.ThrowsAsync<ApiException>(() => pending);
        Assert.Equal("SUPPORT_REVISION_CONFLICT", error.ErrorCode);
        await using var verify = fixture.CreateDbContext();
        var saved = await verify.SupportRequests.SingleAsync();
        Assert.Equal(change == "revision" ? replacementRevision : original.RevisionId, saved.RevisionId);
        Assert.Equal(replacementOwner ?? owner, saved.OwnerUserId);
        Assert.Equal(change == "status" ? SupportRequestStatus.Cancelled : SupportRequestStatus.Open, saved.Status);
        Assert.Single(await verify.SupportRequestEvents.ToListAsync());
    }

    [SkippableFact]
    public async Task AuditActorAndPayloadBindingSurviveLaterChangesAndDisabledMode()
    {
        RequireDatabase();
        var (owner, admin, original) = await Seed();
        await using var db = fixture.CreateDbContext();
        var otherAdmin = await BusinessTestData.User(db, UserRole.Admin);
        var flags = new SupportTestOptions(true);
        var service = SupportTestData.Service(db, flags);
        var command = new AdminSupportReplyRequest(Guid.NewGuid(), original.RevisionId, "Visible answer\r\n\tSecond line", SupportRequestStatus.Resolved, admin);
        var first = await service.ReplyAdminAsync(admin, original.Id, command);
        var actorConflict = await Assert.ThrowsAsync<ApiException>(() => service.ReplyAdminAsync(otherAdmin.Id, original.Id, command with { ExpectedActorUserId = otherAdmin.Id }));
        Assert.Equal("SUPPORT_REVISION_CONFLICT", actorConflict.ErrorCode);
        var reopened = await service.ReplyOwnedAsync(owner, original.Id, new(Guid.NewGuid(), first.Request.RevisionId, "More information", owner));
        flags.CurrentValue.RequestsEnabled = false;
        var retry = await service.ReplyAdminAsync(admin, original.Id, command);
        Assert.True(retry.AlreadyApplied);
        Assert.Equal(first.EventId, retry.EventId);
        Assert.Equal(reopened.Request.RevisionId, retry.Request.RevisionId);
        var mismatch = await Assert.ThrowsAsync<ApiException>(() => service.ReplyAdminAsync(admin, original.Id, command with { Status = SupportRequestStatus.WaitingForUser }));
        Assert.Equal("SUPPORT_IDEMPOTENCY_CONFLICT", mismatch.ErrorCode);
        var audit = await db.SupportRequestEvents.SingleAsync(x => x.Id == first.EventId);
        Assert.Equal(admin, audit.ActorUserId);
        Assert.Equal(command.Body, audit.Body);
        Assert.Equal(original.RevisionId, audit.ExpectedRevisionId);
        Assert.Equal(3, await db.SupportRequestEvents.CountAsync());
        var page = await service.GetOwnedAsync(owner, original.Id, new(null, null, 2, 1));
        Assert.Equal(3, page.History.TotalCount);
        Assert.Equal(first.EventId, Assert.Single(page.History.Items).Id);
    }

    [SkippableFact]
    public async Task MigrationCanRollbackEmptySchemaButRefusesAnyReceivedRequest()
    {
        RequireDatabase();
        await fixture.ResetAsync();
        await using var db = fixture.CreateDbContext();
        var migrator = db.GetService<IMigrator>();
        const string previous = "20261029175812_ProtectMoveRequestOwnerConcurrency";
        await migrator.MigrateAsync(previous);
        await migrator.MigrateAsync();
        Assert.False(db.Database.HasPendingModelChanges());
        var owner = await BusinessTestData.User(db);
        var request = (await SupportTestData.Service(db).CreateAsync(owner.Id, SupportTestData.Create(owner.Id))).Request;
        var error = await Assert.ThrowsAsync<PostgresException>(() => migrator.MigrateAsync(previous));
        Assert.Contains("Support requests exist", error.MessageText);
        Assert.Equal(request.Id, (await db.SupportRequests.SingleAsync()).Id);
        Assert.Single(await db.SupportRequestEvents.ToListAsync());
        Assert.Contains(await db.Database.GetAppliedMigrationsAsync(), x => x.EndsWith("_AddSupportRequestsAndImmutableHistory"));
    }

    private async Task<(Guid Owner, Guid Admin, SupportRequestDetailDto Request)> Seed()
    {
        await fixture.ResetAsync();
        await using var db = fixture.CreateDbContext();
        var owner = await BusinessTestData.User(db, phone: false, consent: false);
        var admin = await BusinessTestData.User(db, UserRole.Admin);
        var request = await SupportTestData.Service(db).CreateAsync(owner.Id, SupportTestData.Create(owner.Id));
        return (owner.Id, admin.Id, request.Request);
    }
    private void RequireDatabase() => Skip.IfNot(fixture.IsConfigured, "Set MOVELY_TEST_POSTGRES_CONNECTION_STRING for support workflow concurrency tests.");
    private MovelyDbContext With(SaveChangesInterceptor interceptor) => new(new DbContextOptionsBuilder<MovelyDbContext>().UseNpgsql(fixture.ConnectionString).AddInterceptors(interceptor).Options);
    private static async Task<(T? Value, ApiException? Error)> Capture<T>(Task<T> task) where T : class { try { return (await task, null); } catch (ApiException error) { return (null, error); } }
    private static async Task<ApiException?> CaptureTask(Task task) { try { await task; return null; } catch (ApiException error) { return error; } }
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
            => throw new InvalidOperationException("Deliberate post-SQL failure to test atomic support history rollback.");
    }
}
