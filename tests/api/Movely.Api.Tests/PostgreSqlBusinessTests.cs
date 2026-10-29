using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Movely.Api.Data;
using Movely.Api.Modules.Businesses;
using Movely.Api.Shared.Errors;
using Npgsql;

namespace Movely.Api.Tests;

[Trait("Category", "PostgreSqlIntegration")]
public sealed class PostgreSqlBusinessTests(PostgreSqlIntegrationFixture fixture) : IClassFixture<PostgreSqlIntegrationFixture>
{
    private const string PreviousMigration = "20261029165124_AddCanonicalLocalityCodes";

    [SkippableFact]
    public async Task MigrationKeepsLegacyVerifiedStatusAndAssignsUsableRevisionWithoutInventingProfile()
    {
        RequireDatabase();
        await fixture.ResetAsync();
        await using var db = fixture.CreateDbContext();
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync(PreviousMigration);
        try {
            var owner = await BusinessTestData.User(db);
            var id = Guid.NewGuid();
            var now = DateTimeOffset.UtcNow;
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"Businesses\" (\"Id\", \"OwnerUserId\", \"Name\", \"Status\", \"CreatedAt\", \"UpdatedAt\") VALUES ({id}, {owner.Id}, {"Legacy Verified"}, {"Verified"}, {now}, {now})");
            await migrator.MigrateAsync();
            var result = await BusinessTestData.Service(db).GetMineAsync(owner.Id);
            Assert.Equal(BusinessStatus.Verified, result.Status);
            Assert.NotEqual(Guid.Empty, result.RevisionId);
            Assert.Null(result.RegistrationNumber);
            Assert.Null(result.RepresentativeConfirmedAt);
            Assert.Null(result.LatestReview);
            Assert.Empty(result.ServiceAreas);
            Assert.Empty(await db.BusinessReviews.ToListAsync());
            Assert.False(db.Database.HasPendingModelChanges());
            // A legacy profile with none of the new fields can still roll back safely.
            await migrator.MigrateAsync(PreviousMigration);
            Assert.DoesNotContain(await db.Database.GetAppliedMigrationsAsync(), x => x.EndsWith("_AddBusinessOnboardingAndReviewHistory"));
            await migrator.MigrateAsync();
            Assert.Equal("Legacy Verified", (await BusinessTestData.Service(db).GetMineAsync(owner.Id)).Name);
        }
        finally { await migrator.MigrateAsync(); }
    }

    [SkippableFact]
    public async Task FailureAfterSqlWritesRollsBackAuditProfileAndVerificationTogether()
    {
        RequireDatabase();
        var (ownerId, adminId, original) = await Seed();
        await using (var db = With(new RejectAfterSave()))
            await Assert.ThrowsAsync<InvalidOperationException>(() => BusinessTestData.Service(db).ReviewAsync(adminId, original.Id, BusinessTestData.Review(original.RevisionId)));
        await using var verify = fixture.CreateDbContext();
        var business = (await verify.Businesses.FindAsync(original.Id))!;
        Assert.Equal(original.RevisionId, business.RevisionId);
        Assert.Equal(BusinessStatus.PendingVerification, business.Status);
        Assert.Equal(ownerId, business.OwnerUserId);
        Assert.False(await verify.BusinessReviews.AnyAsync(x => x.BusinessId == original.Id));
        var mirror = await verify.BusinessVerifications.SingleAsync(x => x.BusinessId == original.Id);
        Assert.Equal(BusinessStatus.PendingVerification, mirror.Status);
        Assert.Null(mirror.ReviewedAt);
        Assert.Null(mirror.ReviewedByUserId);
    }

    [SkippableFact]
    public async Task TwoReviewsOfSameRevisionProduceOneAuditAndConsistentMirror()
    {
        RequireDatabase();
        var (_, adminId, original) = await Seed();
        var barrier = new BothWritesReady();
        await using var first = With(barrier);
        await using var second = With(barrier);
        var outcomes = await Task.WhenAll(
            Capture(BusinessTestData.Service(first).ReviewAsync(adminId, original.Id, BusinessTestData.Review(original.RevisionId))),
            Capture(BusinessTestData.Service(second).ReviewAsync(adminId, original.Id, BusinessTestData.Review(original.RevisionId, BusinessReviewDecision.Reject))));
        AssertConflict(outcomes);
        await using var verify = fixture.CreateDbContext();
        var business = (await verify.Businesses.FindAsync(original.Id))!;
        var audit = await verify.BusinessReviews.SingleAsync(x => x.BusinessId == original.Id);
        Assert.Equal(business.Status, audit.Status);
        Assert.Equal(original.RevisionId, audit.ProfileRevisionId);
        Assert.NotEqual(original.RevisionId, business.RevisionId);
        var mirror = await verify.BusinessVerifications.SingleAsync(x => x.BusinessId == original.Id);
        Assert.Equal(business.Status, mirror.Status);
        Assert.Equal(audit.ProfileRevisionId, mirror.ReviewedProfileRevisionId);
        Assert.Equal(audit.ReviewedByUserId, mirror.ReviewedByUserId);
    }

    [SkippableFact]
    public async Task EditAndVerifyRaceCannotApproveADifferentProfileThanTheReviewedSnapshot()
    {
        RequireDatabase();
        var (ownerId, adminId, original) = await Seed();
        var barrier = new BothWritesReady();
        await using var editDb = With(barrier);
        await using var reviewDb = With(barrier);
        var outcomes = await Task.WhenAll(
            Capture(BusinessTestData.Service(editDb).UpdateAsync(ownerId, BusinessTestData.Update(original))),
            Capture(BusinessTestData.Service(reviewDb).ReviewAsync(adminId, original.Id, BusinessTestData.Review(original.RevisionId))));
        AssertConflict(outcomes);
        await using var verify = fixture.CreateDbContext();
        var business = (await verify.Businesses.FindAsync(original.Id))!;
        var audits = await verify.BusinessReviews.Where(x => x.BusinessId == original.Id).ToListAsync();
        if (business.Status == BusinessStatus.Verified) {
            Assert.Equal(original.Name, business.Name);
            var audit = Assert.Single(audits);
            Assert.Contains(original.Name!, audit.ProfileSnapshotJson);
            Assert.DoesNotContain("Edited Movers", audit.ProfileSnapshotJson);
        } else {
            Assert.Equal(BusinessStatus.PendingVerification, business.Status);
            Assert.Equal("Edited Movers", business.Name);
            Assert.Empty(audits);
        }
        Assert.Equal(business.Status, (await verify.BusinessVerifications.SingleAsync(x => x.BusinessId == original.Id)).Status);
    }

    [SkippableTheory]
    [InlineData("status")]
    [InlineData("owner")]
    public async Task EmergencyAggregateChangesWithoutRevisionStillRejectInFlightReview(string change)
    {
        RequireDatabase();
        var (_, adminId, original) = await Seed();
        var pause = new PausedWrite();
        await using var reviewDb = With(pause);
        var pending = BusinessTestData.Service(reviewDb).ReviewAsync(adminId, original.Id, BusinessTestData.Review(original.RevisionId));
        await pause.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
        Guid? newOwnerId = null;
        try {
            await using var writer = fixture.CreateDbContext();
            var business = (await writer.Businesses.FindAsync(original.Id))!;
            if (change == "status") {
                business.Status = BusinessStatus.Suspended;
                (await writer.BusinessVerifications.SingleAsync(x => x.BusinessId == original.Id)).Status = BusinessStatus.Suspended;
            } else {
                newOwnerId = (await BusinessTestData.User(writer)).Id;
                business.OwnerUserId = newOwnerId.Value;
            }
            await writer.SaveChangesAsync();
        } finally { pause.Release.TrySetResult(); }
        var error = await Assert.ThrowsAsync<ApiException>(() => pending);
        Assert.Equal("BUSINESS_REVISION_CONFLICT", error.ErrorCode);
        Assert.Equal(409, error.StatusCode);
        await using var verify = fixture.CreateDbContext();
        var saved = (await verify.Businesses.FindAsync(original.Id))!;
        Assert.Equal(original.RevisionId, saved.RevisionId);
        Assert.Equal(change == "status" ? BusinessStatus.Suspended : BusinessStatus.PendingVerification, saved.Status);
        if (newOwnerId.HasValue) Assert.Equal(newOwnerId, saved.OwnerUserId);
        Assert.False(await verify.BusinessReviews.AnyAsync(x => x.BusinessId == original.Id));
    }

    [SkippableFact]
    public async Task ConcurrentApplicationsEnforceOneBusinessPerOwnerWithDomain409()
    {
        RequireDatabase();
        Guid ownerId;
        await using (var setup = fixture.CreateDbContext()) ownerId = (await BusinessTestData.User(setup)).Id;
        var barrier = new BothWritesReady();
        await using var first = With(barrier);
        await using var second = With(barrier);
        var outcomes = await Task.WhenAll(
            Capture(BusinessTestData.Service(first).CreateAsync(ownerId, BusinessTestData.Profile)),
            Capture(BusinessTestData.Service(second).CreateAsync(ownerId, BusinessTestData.Profile)));
        Assert.Single(outcomes, x => x is null);
        var conflict = Assert.Single(outcomes, x => x is not null)!;
        Assert.Equal("BUSINESS_ALREADY_EXISTS", conflict.ErrorCode);
        Assert.Equal(409, conflict.StatusCode);
        await using var verify = fixture.CreateDbContext();
        var business = await verify.Businesses.SingleAsync(x => x.OwnerUserId == ownerId);
        Assert.Equal(1, await verify.BusinessVerifications.CountAsync(x => x.BusinessId == business.Id));
    }

    [SkippableFact]
    public async Task RollbackRefusesToEraseReviewHistory()
    {
        RequireDatabase();
        var (_, adminId, original) = await Seed();
        await using var db = fixture.CreateDbContext();
        await BusinessTestData.Service(db).ReviewAsync(adminId, original.Id, BusinessTestData.Review(original.RevisionId));
        var error = await Assert.ThrowsAsync<PostgresException>(() => db.GetService<IMigrator>().MigrateAsync(PreviousMigration));
        Assert.Contains("Business onboarding data or review history exists", error.MessageText);
        Assert.True(await db.BusinessReviews.AnyAsync(x => x.BusinessId == original.Id));
        Assert.Contains(await db.Database.GetAppliedMigrationsAsync(), x => x.EndsWith("_AddBusinessOnboardingAndReviewHistory"));
    }

    [SkippableFact]
    public async Task RollbackRefusesToErasePendingApplicationEvenBeforeFirstReview()
    {
        RequireDatabase();
        await fixture.ResetAsync();
        var (ownerId, _, original) = await Seed();
        await using var db = fixture.CreateDbContext();
        Assert.Empty(await db.BusinessReviews.ToListAsync());
        var error = await Assert.ThrowsAsync<PostgresException>(() => db.GetService<IMigrator>().MigrateAsync(PreviousMigration));
        Assert.Contains("Business onboarding data or review history exists", error.MessageText);
        var saved = await BusinessTestData.Service(db).GetMineAsync(ownerId);
        Assert.Equal(original.RegistrationNumber, saved.RegistrationNumber);
        Assert.Equal(original.RegisteredAddress, saved.RegisteredAddress);
        Assert.Equal(original.RevisionId, saved.RevisionId);
    }

    private async Task<(Guid OwnerId, Guid AdminId, BusinessProfileDto Profile)> Seed()
    {
        await using var db = fixture.CreateDbContext();
        var owner = await BusinessTestData.User(db);
        var admin = await BusinessTestData.User(db, UserRole.Admin);
        return (owner.Id, admin.Id, await BusinessTestData.Service(db).CreateAsync(owner.Id, BusinessTestData.Profile));
    }
    private void RequireDatabase() => Skip.IfNot(fixture.IsConfigured, "Set MOVELY_TEST_POSTGRES_CONNECTION_STRING for PostgreSQL business tests.");
    private MovelyDbContext With(SaveChangesInterceptor interceptor) => new(new DbContextOptionsBuilder<MovelyDbContext>().UseNpgsql(fixture.ConnectionString).AddInterceptors(interceptor).Options);
    private static async Task<ApiException?> Capture(Task operation) { try { await operation; return null; } catch (ApiException error) { return error; } }
    private static void AssertConflict(ApiException?[] outcomes)
    {
        Assert.Single(outcomes, x => x is null);
        var conflict = Assert.Single(outcomes, x => x is not null)!;
        Assert.Equal("BUSINESS_REVISION_CONFLICT", conflict.ErrorCode);
        Assert.Equal(409, conflict.StatusCode);
    }
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
            => throw new InvalidOperationException("Deliberate post-SQL failure to test business review rollback.");
    }
}
