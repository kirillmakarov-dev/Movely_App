using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using System.Net.Http.Json;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Modules.Identity;
using Movely.Api.Modules.MoveRequests;
using Movely.Api.Shared.Errors;
using Movely.Api.Shared.Time;

namespace Movely.Api.Tests;

[Trait("Category", "Integration")]
public sealed class ActiveRequestConsentTests
{
    [Theory]
    [InlineData("missing-version", "REQUEST_VERSION_CONFLICT", 409)]
    [InlineData("stale-version", "REQUEST_VERSION_CONFLICT", 409)]
    [InlineData("missing-consent", "CONTACT_SHARING_REQUIRED", 400)]
    [InlineData("declined-consent", "CONTACT_SHARING_REQUIRED", 400)]
    [InlineData("old-disclosure", "POLICY_VERSION_CHANGED", 409)]
    [InlineData("wrong-limit", "RECIPIENT_LIMIT_CHANGED", 409)]
    [InlineData("missing-route", "REQUEST_INCOMPLETE", 400)]
    [InlineData("missing-items", "REQUEST_INCOMPLETE", 400)]
    [InlineData("missing-apartment", "REQUEST_INCOMPLETE", 400)]
    [InlineData("unverified-phone", "PHONE_NOT_VERIFIED", 400)]
    [InlineData("old-policy", "POLICY_ACCEPTANCE_REQUIRED", 400)]
    [InlineData("suspended-user", "CUSTOMER_NOT_ELIGIBLE", 403)]
    [InlineData("changed-role", "CUSTOMER_NOT_ELIGIBLE", 403)]
    [InlineData("legal-gate", "LEGAL_NOT_READY", 503)]
    public async Task InvalidActiveUpdateLeavesPublishedVersionAndConsentUnchanged(string scenario, string errorCode, int status)
    {
        await using var db = CreateDb();
        var original = await ActiveRequestTestData.CreatePublishedAsync(db);
        var request = ActiveRequestTestData.Update(original);
        switch (scenario)
        {
            case "missing-version": request = request with { ExpectedCurrentVersionId = null }; break;
            case "stale-version": request = request with { ExpectedCurrentVersionId = Guid.NewGuid() }; break;
            case "missing-consent": request = request with { ContactSharing = null }; break;
            case "declined-consent": request = request with { ContactSharing = ConsentFixtures.Sharing with { ShareContacts = false } }; break;
            case "old-disclosure": request = request with { ContactSharing = ConsentFixtures.Sharing with { DisclosureVersion = "old" } }; break;
            case "wrong-limit": request = request with { ContactSharing = ConsentFixtures.Sharing with { MaxRecipients = original.MaxLeadBuyers + 1 } }; break;
            case "missing-route": request = request with { Pickup = null }; break;
            case "missing-items": request = request with { SmallMoveItems = [] }; break;
            case "missing-apartment": request = request with { RequestType = MoveRequestType.ApartmentMove, ApartmentMove = null, SmallMoveItems = [] }; break;
            case "unverified-phone": (await db.Users.FindAsync(original.CustomerUserId))!.PhoneVerified = false; break;
            case "old-policy": (await db.PolicyAcceptances.SingleAsync()).PrivacyVersion = "old"; break;
            case "suspended-user": (await db.Users.FindAsync(original.CustomerUserId))!.Status = UserStatus.Suspended; break;
            case "changed-role": (await db.Users.FindAsync(original.CustomerUserId))!.Role = UserRole.Mover; break;
        }
        await db.SaveChangesAsync();
        var service = ActiveRequestTestData.Service(db, scenario == "legal-gate" ? new RejectConsentGate() : null);
        var error = await Assert.ThrowsAsync<ApiException>(() => service.UpdateOwnedAsync(original.CustomerUserId, original.Id, request));
        Assert.Equal(errorCode, error.ErrorCode);
        Assert.Equal(status, error.StatusCode);
        var stored = await db.MoveRequests.AsNoTracking().SingleAsync();
        Assert.Equal(original.CurrentVersion!.Id, stored.CurrentVersionId);
        Assert.Equal(original.Status, stored.Status);
        Assert.Equal(original.PublishedAt, stored.PublishedAt);
        Assert.Equal(2, await db.MoveRequestVersions.CountAsync());
        var consent = await db.ContactSharingAcceptances.AsNoTracking().SingleAsync();
        Assert.Equal(original.CurrentVersion.Id, consent.RequestVersionId);
    }

    [Theory]
    [InlineData(MoveRequestStatus.Active, LeadSalesStatus.Available, 1)]
    [InlineData(MoveRequestStatus.Active, LeadSalesStatus.SoldOut, 3)]
    [InlineData(MoveRequestStatus.Published, LeadSalesStatus.Available, 1)]
    public async Task ExplicitConsentCreatesANewVersionAndPreservesSalesAndHistoricalEvidence(MoveRequestStatus status, LeadSalesStatus sales, int buyers)
    {
        await using var db = CreateDb();
        var original = await ActiveRequestTestData.CreatePublishedAsync(db);
        var stored = await db.MoveRequests.SingleAsync();
        stored.Status = status;
        stored.LeadSalesStatus = sales;
        stored.ActiveBuyerCount = buyers;
        await db.SaveChangesAsync();
        var previousConsent = await db.ContactSharingAcceptances.AsNoTracking().SingleAsync();
        var updated = await ActiveRequestTestData.Service(db).UpdateOwnedAsync(original.CustomerUserId, original.Id, ActiveRequestTestData.Update(original));
        Assert.Equal(status, updated.Status);
        Assert.Equal(sales, updated.LeadSalesStatus);
        Assert.Equal(buyers, updated.ActiveBuyerCount);
        Assert.Equal(original.MaxLeadBuyers, updated.MaxLeadBuyers);
        Assert.Equal(original.LeadPrice, updated.LeadPrice);
        Assert.Equal(original.PublishedAt, updated.PublishedAt);
        Assert.NotEqual(original.CurrentVersion!.Id, updated.CurrentVersion!.Id);
        Assert.Equal(3, updated.CurrentVersion.VersionNumber);
        Assert.Equal("Updated description", updated.CurrentVersion.CustomerComment);
        var history = await ActiveRequestTestData.Service(db).GetVersionAsync(original.CustomerUserId, original.Id, original.CurrentVersion.Id);
        Assert.Equal("Original description", history.CustomerComment);
        Assert.Equal(2, await db.ContactSharingAcceptances.CountAsync());
        var oldRecord = await db.ContactSharingAcceptances.AsNoTracking().SingleAsync(x => x.Id == previousConsent.Id);
        Assert.Equal(previousConsent.RequestVersionId, oldRecord.RequestVersionId);
        Assert.Equal(previousConsent.AcceptedAt, oldRecord.AcceptedAt);
        Assert.Equal(previousConsent.DisclosureVersion, oldRecord.DisclosureVersion);
        Assert.Equal(previousConsent.MaxRecipients, oldRecord.MaxRecipients);
        var newRecord = await db.ContactSharingAcceptances.SingleAsync(x => x.RequestVersionId == updated.CurrentVersion.Id);
        Assert.Equal(original.CustomerUserId, newRecord.UserId);
        Assert.Equal(ConsentPolicy.Version, newRecord.DisclosureVersion);
        Assert.Equal(original.MaxLeadBuyers, newRecord.MaxRecipients);
        Assert.Equal(ConsentPolicy.IsDraft, newRecord.IsTestOnly);
    }

    [Fact]
    public async Task LegacyActiveVersionWithoutMatchingConsentRequiresFreshExplicitAcceptance()
    {
        await using var db = CreateDb();
        var original = await ActiveRequestTestData.CreatePublishedAsync(db);
        db.ContactSharingAcceptances.RemoveRange(db.ContactSharingAcceptances);
        await db.SaveChangesAsync();
        var service = ActiveRequestTestData.Service(db);
        await Assert.ThrowsAsync<ApiException>(() => service.UpdateOwnedAsync(original.CustomerUserId, original.Id,
            ActiveRequestTestData.Update(original) with { ContactSharing = null }));
        Assert.Empty(await db.ContactSharingAcceptances.ToListAsync());
        var restored = await service.UpdateOwnedAsync(original.CustomerUserId, original.Id, ActiveRequestTestData.Update(original));
        var acceptance = await db.ContactSharingAcceptances.SingleAsync();
        Assert.Equal(restored.CurrentVersion!.Id, acceptance.RequestVersionId);
        Assert.NotEqual(original.CurrentVersion!.Id, acceptance.RequestVersionId);
    }

    [Fact]
    public async Task DraftUpdatesRemainCompatibleWithoutConsentButRejectSuppliedStaleVersion()
    {
        await using var db = CreateDb();
        var published = await ActiveRequestTestData.CreatePublishedAsync(db);
        var service = ActiveRequestTestData.Service(db);
        var draft = await service.CreateDraftAsync(published.CustomerUserId, new CreateMoveRequestRequest(MoveRequestType.SmallMove));
        var updated = await service.UpdateOwnedAsync(published.CustomerUserId, draft.Id, ActiveRequestTestData.Update());
        Assert.Equal(MoveRequestStatus.Draft, updated.Status);
        Assert.False(await db.ContactSharingAcceptances.AnyAsync(x => x.MoveRequestId == draft.Id));
        var error = await Assert.ThrowsAsync<ApiException>(() => service.UpdateOwnedAsync(published.CustomerUserId, draft.Id,
            ActiveRequestTestData.Update() with { ExpectedCurrentVersionId = draft.CurrentVersion!.Id }));
        Assert.Equal(409, error.StatusCode);
    }

    private static MovelyDbContext CreateDb() => new(new DbContextOptionsBuilder<MovelyDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    private sealed class RejectConsentGate : IConsentReleaseGate
    {
        public void EnsureAvailable() => throw new ApiException("LEGAL_NOT_READY", "Policies are not approved.", 503);
    }
}

internal static class ActiveRequestTestData
{
    public static MoveRequestService Service(MovelyDbContext db, IConsentReleaseGate? gate = null)
        => new(db, new SystemClock(), Options.Create(new MoveRequestOptions()), gate ?? new TestConsentGate());

    public static async Task<MoveRequestResponse> CreatePublishedAsync(MovelyDbContext db)
    {
        var user = new MovelyUser {
            Id = Guid.NewGuid(), FirstName = "Test", LastName = "Customer", Role = UserRole.Customer,
            Phone = "+972501234567", PhoneVerified = true, Status = UserStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
        };
        db.Users.Add(user);
        ConsentPolicy.Add(db, user.Id, DateTimeOffset.UtcNow);
        await db.SaveChangesAsync();
        var service = Service(db);
        var draft = await service.CreateDraftAsync(user.Id, new CreateMoveRequestRequest(MoveRequestType.SmallMove));
        await service.UpdateOwnedAsync(user.Id, draft.Id, Update() with { CustomerComment = "Original description" });
        var published = await service.PublishOwnedAsync(user.Id, draft.Id, ConsentFixtures.Sharing);
        db.ChangeTracker.Clear();
        return published.MoveRequest;
    }

    public static UpdateMoveRequestRequest Update(MoveRequestResponse? active = null) => new(
        MoveRequestType.SmallMove,
        new MoveLocationDto("Tel Aviv", "Test Street 1", 0, false, ElevatorFurnitureSuitability.Unknown, null, null, 5),
        new MoveLocationDto("Haifa", "Test Street 2", 1, true, ElevatorFurnitureSuitability.Yes, null, null, 5),
        null, [new MoveItemDto(MoveItemKind.SmallMoveItem, null, null, SmallMoveItemCategory.Furniture, "Desk", null, 1, 100, 60, 70, 15)],
        [], new MoveScheduleDto(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14)), PreferredMoveTime.Morning, MoveDateFlexibility.Exact),
        MoveBudgetBand.Unknown, "Updated description", [],
        active?.CurrentVersion?.Id,
        active is null ? null : ConsentFixtures.Sharing with { MaxRecipients = active.MaxLeadBuyers });

    private sealed class TestConsentGate : IConsentReleaseGate { public void EnsureAvailable() { } }
}

[Trait("Category", "Integration")]
public sealed class ActiveRequestConsentHttpTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task ActivePutBindsExplicitVersionAndSharingAndReturnsConflictForStaleClients()
    {
        using var client = factory.CreateClient();
        await SetCsrfAsync(client);
        var subject = Guid.NewGuid().ToString("N");
        using var login = await client.PostAsJsonAsync("/api/v1/auth/google/sign-in",
            new GoogleSignInRequest($"dev-google:{subject}:{subject}@example.com:Active:Customer", ConsentFixtures.Acceptance));
        login.EnsureSuccessStatusCode();
        var user = (await login.Content.ReadFromJsonAsync<CurrentUserDto>(ApiJson.Options))!;
        MoveRequestResponse original;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            var owner = (await db.Users.FindAsync(user.Id))!;
            owner.Phone = "+972501234567";
            owner.PhoneVerified = true;
            await db.SaveChangesAsync();
            var service = ActiveRequestTestData.Service(db);
            var draft = await service.CreateDraftAsync(user.Id, new CreateMoveRequestRequest(MoveRequestType.SmallMove));
            await service.UpdateOwnedAsync(user.Id, draft.Id, ActiveRequestTestData.Update());
            original = (await service.PublishOwnedAsync(user.Id, draft.Id, ConsentFixtures.Sharing)).MoveRequest;
        }
        await SetCsrfAsync(client);
        using var missing = await client.PutAsJsonAsync($"/api/v1/move-requests/{original.Id}", ActiveRequestTestData.Update());
        Assert.Equal(System.Net.HttpStatusCode.Conflict, missing.StatusCode);
        Assert.Contains("REQUEST_VERSION_CONFLICT", await missing.Content.ReadAsStringAsync());
        using var update = await client.PutAsJsonAsync($"/api/v1/move-requests/{original.Id}", ActiveRequestTestData.Update(original));
        update.EnsureSuccessStatusCode();
        var current = (await update.Content.ReadFromJsonAsync<MoveRequestResponse>(ApiJson.Options))!;
        Assert.NotEqual(original.CurrentVersion!.Id, current.CurrentVersion!.Id);
        Assert.Equal(MoveRequestStatus.Active, current.Status);
        using var stale = await client.PutAsJsonAsync($"/api/v1/move-requests/{original.Id}", ActiveRequestTestData.Update(original));
        Assert.Equal(System.Net.HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Contains("REQUEST_VERSION_CONFLICT", await stale.Content.ReadAsStringAsync());
        using var verifyScope = factory.Services.CreateScope();
        var verify = verifyScope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        Assert.Equal(3, await verify.MoveRequestVersions.CountAsync(x => x.MoveRequestId == original.Id));
        Assert.Equal(2, await verify.ContactSharingAcceptances.CountAsync(x => x.MoveRequestId == original.Id));
    }

    private static async Task SetCsrfAsync(HttpClient client)
    {
        var csrf = (await client.GetFromJsonAsync<CsrfReply>("/api/v1/auth/csrf"))!;
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf.RequestToken);
    }
    private sealed record CsrfReply(string RequestToken);
}
