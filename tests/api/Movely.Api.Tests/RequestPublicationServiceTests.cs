using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Modules.Identity;
using Movely.Api.Modules.MoveRequests;
using Movely.Api.Shared.Errors;
using Movely.Api.Shared.Time;

namespace Movely.Api.Tests;

public sealed class RequestPublicationServiceTests
{
    [Theory]
    [InlineData("draft", "REQUEST_NOT_ACTIVE", false)]
    [InlineData("published", "REQUEST_NOT_ACTIVE", false)]
    [InlineData("closed", "REQUEST_NOT_ACTIVE", false)]
    [InlineData("cancelled", "REQUEST_NOT_ACTIVE", false)]
    [InlineData("expired", "REQUEST_NOT_ACTIVE", false)]
    [InlineData("sales-closed", "SALES_UNAVAILABLE", false)]
    [InlineData("past", "MOVE_DATE_INVALID", false)]
    [InlineData("no-published-at", "PUBLICATION_MISSING", false)]
    [InlineData("no-version", "REQUEST_VERSION_INVALID", false)]
    [InlineData("type-mismatch", "REQUEST_VERSION_INVALID", false)]
    [InlineData("unverified-owner", "PHONE_NOT_VERIFIED", false)]
    [InlineData("suspended-owner", "CUSTOMER_NOT_ELIGIBLE", false)]
    [InlineData("owner-role", "CUSTOMER_NOT_ELIGIBLE", false)]
    [InlineData("old-policy", "POLICY_ACCEPTANCE_REQUIRED", false)]
    [InlineData("no-consent", "CONTACT_SHARING_REQUIRED", true)]
    [InlineData("wrong-consent-version", "CONTACT_SHARING_REQUIRED", true)]
    [InlineData("wrong-consent-owner", "CONTACT_SHARING_HISTORY_CONFLICT", false)]
    [InlineData("old-disclosure", "CONTACT_SHARING_REQUIRED", true)]
    [InlineData("wrong-limit", "CONTACT_SHARING_REQUIRED", true)]
    [InlineData("wrong-test-mode", "CONTACT_SHARING_REQUIRED", true)]
    [InlineData("negative-buyers", "RECIPIENT_LIMIT_INVALID", false)]
    [InlineData("zero-max", "RECIPIENT_LIMIT_INVALID", false)]
    [InlineData("empty-address", "REQUEST_INCOMPLETE", false)]
    [InlineData("no-small-item", "REQUEST_INCOMPLETE", false)]
    [InlineData("invalid-enum", "REQUEST_INCOMPLETE", false)]
    public async Task OwnerExplanationMatchesActualMarketplaceEligibility(string mutation, string blocker, bool canRenew)
    {
        await using var db = BusinessTestData.Memory();
        var row = await MarketplaceTestData.SeedAsync(db);
        var viewer = await MarketplaceTestData.SeedViewerAsync(db);
        MarketplaceTestData.MakeIneligible(db, row, mutation);
        await db.SaveChangesAsync();
        var status = await RequestPublicationTestData.Service(db).GetPublicationStatusAsync(row.CustomerUserId, row.Id);
        Assert.Contains(blocker, status.Blockers);
        Assert.False(status.EligibleForMarketplace);
        Assert.Equal(canRenew, status.CanRenewContactSharing);
        Assert.Empty((await MarketplaceTestData.Service(db, viewer).ListAsync(MarketplaceTestData.Search())).Items);
    }

    [Fact]
    public async Task UnknownCanonicalCitiesAndSoldOutDoNotBlockAnOtherwiseEligibleRequest()
    {
        await using var db = BusinessTestData.Memory();
        var row = await MarketplaceTestData.SeedAsync(db);
        foreach (var location in row.CurrentVersion!.Locations) location.CanonicalLocalityCode = null;
        row.LeadSalesStatus = LeadSalesStatus.SoldOut;
        row.ActiveBuyerCount = row.MaxLeadBuyers;
        await db.SaveChangesAsync();
        var status = await RequestPublicationTestData.Service(db).GetPublicationStatusAsync(row.CustomerUserId, row.Id);
        Assert.True(status.EligibleForMarketplace);
        Assert.Empty(status.Blockers);
        Assert.False(status.CanRenewContactSharing);
        Assert.Equal(LeadSalesStatus.SoldOut, status.LeadSalesStatus);
        var viewer = await MarketplaceTestData.SeedViewerAsync(db);
        Assert.Single((await MarketplaceTestData.Service(db, viewer).ListAsync(MarketplaceTestData.Search())).Items);
    }

    [Theory]
    [InlineData("2026-07-10T21:00:00Z", "2026-07-10", "2026-07-11")]
    [InlineData("2026-10-29T22:00:00Z", "2026-10-29", "2026-10-30")]
    public async Task OwnerStatusUsesSameIsraelCalendarBoundaryAsMarketplace(string instant, string yesterday, string today)
    {
        var now = DateTimeOffset.Parse(instant);
        await using var db = BusinessTestData.Memory();
        var row = await MarketplaceTestData.SeedAsync(db, now);
        row.CurrentVersion!.MoveDate = DateOnly.Parse(yesterday);
        await db.SaveChangesAsync();
        var service = RequestPublicationTestData.Service(db, now);
        Assert.Contains("MOVE_DATE_INVALID", (await service.GetPublicationStatusAsync(row.CustomerUserId, row.Id)).Blockers);
        row.CurrentVersion.MoveDate = DateOnly.Parse(today);
        await db.SaveChangesAsync();
        var status = await service.GetPublicationStatusAsync(row.CustomerUserId, row.Id);
        Assert.True(status.EligibleForMarketplace);
        Assert.Equal(now, status.CheckedAt);
    }

    [Theory]
    [InlineData("old-disclosure")]
    [InlineData("wrong-limit")]
    [InlineData("wrong-test-mode")]
    [InlineData("wrong-consent-version")]
    public async Task RenewalAppendsExactCurrentConsentWithoutEditingContentOrHistoricalAcceptance(string mutation)
    {
        await using var db = BusinessTestData.Memory();
        var row = await MarketplaceTestData.SeedAsync(db);
        MarketplaceTestData.MakeIneligible(db, row, mutation);
        row.LeadSalesStatus = LeadSalesStatus.SoldOut;
        row.ActiveBuyerCount = row.MaxLeadBuyers;
        await db.SaveChangesAsync();
        var originalVersion = row.CurrentVersionId;
        var publishedAt = row.PublishedAt;
        var updatedAt = row.UpdatedAt;
        var old = await db.ContactSharingAcceptances.AsNoTracking().SingleAsync();
        var service = RequestPublicationTestData.Service(db);
        var first = await service.RenewContactSharingAsync(row.CustomerUserId, row.Id, RequestPublicationTestData.Renew(row));
        Assert.False(first.AlreadyAccepted);
        Assert.True(first.PublicationStatus.EligibleForMarketplace);
        Assert.False(first.PublicationStatus.CanRenewContactSharing);
        Assert.Equal(originalVersion, first.PublicationStatus.CurrentVersionId);
        Assert.Equal(LeadSalesStatus.SoldOut, first.PublicationStatus.LeadSalesStatus);
        var stored = (await db.MoveRequests.FindAsync(row.Id))!;
        Assert.Equal(publishedAt, stored.PublishedAt);
        Assert.Equal(updatedAt, stored.UpdatedAt);
        Assert.Equal(row.MaxLeadBuyers, stored.ActiveBuyerCount);
        Assert.Single(db.MoveRequestVersions);
        Assert.Equal(2, await db.ContactSharingAcceptances.CountAsync());
        var preserved = await db.ContactSharingAcceptances.AsNoTracking().SingleAsync(x => x.Id == old.Id);
        Assert.Equal(old.DisclosureVersion, preserved.DisclosureVersion);
        Assert.Equal(old.RequestVersionId, preserved.RequestVersionId);
        Assert.Equal(old.MaxRecipients, preserved.MaxRecipients);
        Assert.Equal(old.IsTestOnly, preserved.IsTestOnly);
        Assert.Equal(old.AcceptedAt, preserved.AcceptedAt);
        var second = await service.RenewContactSharingAsync(row.CustomerUserId, row.Id, RequestPublicationTestData.Renew(row));
        Assert.True(second.AlreadyAccepted);
        Assert.Equal(first.PublicationStatus.ContactSharingAcceptedAt, second.PublicationStatus.ContactSharingAcceptedAt);
        Assert.Equal(2, await db.ContactSharingAcceptances.CountAsync());
        Assert.Equal(updatedAt, (await db.MoveRequests.FindAsync(row.Id))!.UpdatedAt);
    }

    [Fact]
    public async Task ExistingConsentDoesNotBypassExplicitConfirmationOrVersionValidation()
    {
        await using var db = BusinessTestData.Memory();
        var row = await MarketplaceTestData.SeedAsync(db);
        var service = RequestPublicationTestData.Service(db);
        var error = await Assert.ThrowsAsync<ApiException>(() => service.RenewContactSharingAsync(row.CustomerUserId, row.Id,
            RequestPublicationTestData.Renew(row) with { ContactSharing = ConsentFixtures.Sharing with { ShareContacts = false } }));
        Assert.Equal("CONTACT_SHARING_REQUIRED", error.ErrorCode);
        var stale = await Assert.ThrowsAsync<ApiException>(() => service.RenewContactSharingAsync(row.CustomerUserId, row.Id,
            RequestPublicationTestData.Renew(row) with { ExpectedCurrentVersionId = Guid.NewGuid() }));
        Assert.Equal("REQUEST_VERSION_CONFLICT", stale.ErrorCode);
        Assert.Single(db.ContactSharingAcceptances);
    }

    [Theory]
    [InlineData("draft")]
    [InlineData("published")]
    [InlineData("closed")]
    [InlineData("past")]
    [InlineData("sales-closed")]
    [InlineData("empty-address")]
    [InlineData("invalid-enum")]
    public async Task RenewalCannotRepairOtherPublicationFailuresOrChangeLifecycle(string mutation)
    {
        await using var db = BusinessTestData.Memory();
        var row = await MarketplaceTestData.SeedAsync(db);
        MarketplaceTestData.MakeIneligible(db, row, mutation);
        await db.SaveChangesAsync();
        var status = row.Status;
        var versionId = row.CurrentVersionId;
        var error = await Assert.ThrowsAsync<ApiException>(() => RequestPublicationTestData.Service(db)
            .RenewContactSharingAsync(row.CustomerUserId, row.Id, RequestPublicationTestData.Renew(row)));
        Assert.Equal("PUBLICATION_RENEWAL_UNAVAILABLE", error.ErrorCode);
        Assert.Equal(400, error.StatusCode);
        Assert.Equal(status, row.Status);
        Assert.Equal(versionId, row.CurrentVersionId);
        Assert.Single(db.ContactSharingAcceptances);
    }

    [Fact]
    public async Task LegalGateIsExplainedWithoutMutatingRequestAndRejectsRenewal()
    {
        await using var db = BusinessTestData.Memory();
        var row = await MarketplaceTestData.SeedAsync(db);
        var service = RequestPublicationTestData.Service(db, gate: new BusinessTestData.BlockLegal());
        var status = await service.GetPublicationStatusAsync(row.CustomerUserId, row.Id);
        Assert.Contains("LEGAL_NOT_READY", status.Blockers);
        Assert.False(status.EligibleForMarketplace);
        Assert.False(status.CanRenewContactSharing);
        Assert.True(status.HasCurrentContactSharing);
        Assert.Equal(503, (await Assert.ThrowsAsync<ApiException>(() => service.RenewContactSharingAsync(row.CustomerUserId, row.Id, RequestPublicationTestData.Renew(row)))).StatusCode);
        Assert.Single(db.ContactSharingAcceptances);
    }

    [Fact]
    public async Task ForeignOwnerExactKeyCollisionCannotBeRenewedOrTreatedAsIdempotent()
    {
        await using var db = BusinessTestData.Memory();
        var row = await MarketplaceTestData.SeedAsync(db);
        MarketplaceTestData.MakeIneligible(db, row, "wrong-consent-owner");
        await db.SaveChangesAsync();
        var service = RequestPublicationTestData.Service(db);
        var status = await service.GetPublicationStatusAsync(row.CustomerUserId, row.Id);
        Assert.False(status.CanRenewContactSharing);
        Assert.Contains("CONTACT_SHARING_HISTORY_CONFLICT", status.Blockers);
        var error = await Assert.ThrowsAsync<ApiException>(() => service.RenewContactSharingAsync(row.CustomerUserId, row.Id, RequestPublicationTestData.Renew(row)));
        Assert.Equal("CONTACT_SHARING_HISTORY_CONFLICT", error.ErrorCode);
        Assert.Equal(409, error.StatusCode);
        Assert.Single(db.ContactSharingAcceptances);
    }
}

internal static class RequestPublicationTestData
{
    public static MoveRequestService Service(MovelyDbContext db, DateTimeOffset? now = null, IConsentReleaseGate? gate = null)
        => new(db, new FrozenClock(now ?? DateTimeOffset.UtcNow), Options.Create(new MoveRequestOptions()), gate ?? new BusinessTestData.AllowLegal());
    public static RenewContactSharingRequest Renew(MoveRequest row) => new(row.CurrentVersionId!.Value, new(true, ConsentPolicy.Version, row.MaxLeadBuyers));
    public static RenewContactSharingRequest Renew(MoveRequestResponse row) => new(row.CurrentVersion!.Id, new(true, ConsentPolicy.Version, row.MaxLeadBuyers));
    private sealed class FrozenClock(DateTimeOffset now) : IClock { public DateTimeOffset UtcNow => now; }
}
