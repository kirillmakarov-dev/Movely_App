using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Modules.Identity;
using Movely.Api.Modules.Localities;
using Movely.Api.Modules.Marketplace;
using Movely.Api.Shared.Authorization;
using Movely.Api.Shared.Errors;
using Movely.Api.Shared.Time;

namespace Movely.Api.Tests;

[Trait("Category", "Integration")]
public sealed class MarketplaceTests : IDisposable
{
    private readonly ApiFactory _factory = new();
    public void Dispose() => _factory.Dispose();

    [Theory]
    [InlineData(null, null, 401)]
    [InlineData(UserRole.Customer, null, 403)]
    [InlineData(UserRole.Admin, null, 403)]
    [InlineData(UserRole.Mover, BusinessStatus.PendingVerification, 403)]
    [InlineData(UserRole.Mover, BusinessStatus.Suspended, 403)]
    [InlineData(UserRole.Mover, BusinessStatus.Rejected, 403)]
    [InlineData(UserRole.Mover, BusinessStatus.Verified, 200)]
    public async Task CatalogueRequiresVerifiedMover(UserRole? role, BusinessStatus? business, int status)
    {
        using var client = role is null ? _factory.CreateClient() : await Viewer(role.Value, business);
        Assert.Equal(status, (int)(await client.GetAsync("/api/v1/marketplace/requests")).StatusCode);
        Assert.Equal(role == UserRole.Mover && business == BusinessStatus.Verified ? 404 : status,
            (int)(await client.GetAsync($"/api/v1/marketplace/requests/{Guid.NewGuid()}")).StatusCode);
    }

    [Fact]
    public async Task ExistingViewerSessionObservesBusinessRevocationAndPolicyChanges()
    {
        using var client = await Viewer();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/marketplace/requests")).StatusCode);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            var business = await db.Businesses.SingleAsync();
            business.Status = BusinessStatus.Suspended;
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/marketplace/requests")).StatusCode);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            (await db.Businesses.SingleAsync()).Status = BusinessStatus.Verified;
            (await db.PolicyAcceptances.SingleAsync()).TermsVersion = "old";
            await db.SaveChangesAsync();
        }
        using var refused = await client.GetAsync("/api/v1/marketplace/requests");
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
        Assert.Contains("POLICY_ACCEPTANCE_REQUIRED", await refused.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("page=0")]
    [InlineData("page=-1")]
    [InlineData("page=2147483647&pageSize=50")]
    [InlineData("pageSize=0")]
    [InlineData("pageSize=51")]
    [InlineData("pageSize=x")]
    [InlineData("requestType=0")]
    [InlineData("requestType=smallmove")]
    [InlineData("budgetBand=not-a-band")]
    [InlineData("sort=Random")]
    [InlineData("pickupCityCode=unknown")]
    [InlineData("destinationCityCode=Haifa")]
    [InlineData("moveDate=2026-02-30")]
    [InlineData("moveDate=2026-1-2")]
    [InlineData("moveDate=2026-01-01T00:00:00Z")]
    [InlineData("page=1&page=2")]
    [InlineData("sort=")]
    public async Task InvalidFiltersReturnControlledBadRequest(string query)
    {
        using var client = await Viewer();
        using var response = await client.GetAsync($"/api/v1/marketplace/requests?{query}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("INVALID_MARKETPLACE_FILTER", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task CardsAndDetailsUseCanonicalCitiesAndExcludeAllPrivateTextAndPhotoMetadata()
    {
        using var client = await Viewer();
        var request = await Seed();
        using var listResponse = await client.GetAsync("/api/v1/marketplace/requests");
        listResponse.EnsureSuccessStatusCode();
        Assert.True(listResponse.Headers.CacheControl?.NoStore);
        var listJson = await listResponse.Content.ReadAsStringAsync();
        Assert.DoesNotContain(MarketplaceTestData.PrivateMarker, listJson);
        using var list = JsonDocument.Parse(listJson);
        var card = Assert.Single(list.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal(request.Id, card.GetProperty("id").GetGuid());
        Assert.Equal("5000", card.GetProperty("pickupCity").GetProperty("code").GetString());
        Assert.Equal("4000", card.GetProperty("destinationCity").GetProperty("code").GetString());
        Assert.Equal(6, card.GetProperty("boxCount").GetInt64());
        Assert.Equal(5, card.GetProperty("itemCount").GetInt64());
        AssertFields(card, MarketplaceTestData.CardFields);
        using var detailResponse = await client.GetAsync($"/api/v1/marketplace/requests/{request.Id}");
        detailResponse.EnsureSuccessStatusCode();
        Assert.True(detailResponse.Headers.CacheControl?.NoStore);
        var detailJson = await detailResponse.Content.ReadAsStringAsync();
        Assert.DoesNotContain(MarketplaceTestData.PrivateMarker, detailJson);
        Assert.DoesNotContain(request.CustomerUserId.ToString(), detailJson);
        using var detail = JsonDocument.Parse(detailJson);
        AssertFields(detail.RootElement, [.. MarketplaceTestData.CardFields, "pickupAccess", "destinationAccess", "preferredTime", "dateFlexibility", "items", "services"]);
        foreach (var item in detail.RootElement.GetProperty("items").EnumerateArray())
            AssertFields(item, ["kind", "apartmentInventoryType", "specialItemType", "smallMoveCategory", "quantity", "lengthCm", "widthCm", "heightCm", "approximateWeightKg"]);
        Assert.Equal(2, detail.RootElement.GetProperty("pickupAccess").GetProperty("floor").GetInt32());
    }

    [Fact]
    public async Task UnknownCanonicalCityIsNullWithoutFallingBackToPrivateCity()
    {
        using var client = await Viewer();
        var request = await Seed();
        await Mutate(request.Id, (db, _) => {
            foreach (var location in db.MoveLocations.Where(x => x.MoveRequestVersionId == request.CurrentVersionId)) location.CanonicalLocalityCode = "999999";
        });
        var detail = (await client.GetFromJsonAsync<MarketplaceDetailDto>($"/api/v1/marketplace/requests/{request.Id}", ApiJson.Options))!;
        Assert.Null(detail.PickupCity);
        Assert.Null(detail.DestinationCity);
        Assert.Equal(1, (await client.GetFromJsonAsync<MarketplacePageDto>("/api/v1/marketplace/requests", ApiJson.Options))!.TotalCount);
    }

    [Fact]
    public async Task FiltersAndStablePagingOperateOnServerAndSoldOutRemainsVisible()
    {
        using var client = await Viewer();
        var first = await Seed();
        var second = await Seed();
        var third = await Seed();
        var today = BusinessCalendar.Today(DateTimeOffset.UtcNow);
        var published = DateTimeOffset.UtcNow;
        await Mutate(first.Id, (db, row) => { row.PublishedAt = published; row.LeadSalesStatus = LeadSalesStatus.SoldOut; row.CurrentVersion!.MoveDate = today.AddDays(2); });
        await Mutate(second.Id, (db, row) => { row.PublishedAt = published.AddMinutes(-1); row.ActiveBuyerCount = row.MaxLeadBuyers; row.CurrentVersion!.MoveDate = today.AddDays(1); });
        await Mutate(third.Id, (db, row) => { row.PublishedAt = published.AddMinutes(-2); row.CurrentVersion!.MoveDate = today.AddDays(1); row.CurrentVersion.BudgetBand = MoveBudgetBand.From1000To1500; });
        var newest = (await client.GetFromJsonAsync<MarketplacePageDto>("/api/v1/marketplace/requests?pageSize=1", ApiJson.Options))!;
        Assert.Equal(3, newest.TotalCount);
        Assert.Equal(first.Id, Assert.Single(newest.Items).Id);
        Assert.Equal(LeadSalesStatus.SoldOut, newest.Items[0].LeadSalesStatus);
        var secondPage = (await client.GetFromJsonAsync<MarketplacePageDto>("/api/v1/marketplace/requests?pageSize=1&page=2", ApiJson.Options))!;
        Assert.Equal(second.Id, Assert.Single(secondPage.Items).Id);
        Assert.Equal(LeadSalesStatus.SoldOut, secondPage.Items[0].LeadSalesStatus);
        var dateOrder = (await client.GetFromJsonAsync<MarketplacePageDto>("/api/v1/marketplace/requests?sort=MoveDate", ApiJson.Options))!;
        Assert.Equal(new[] { second.Id, third.Id }.Order().Append(first.Id), dateOrder.Items.Select(x => x.Id));
        var filtered = (await client.GetFromJsonAsync<MarketplacePageDto>($"/api/v1/marketplace/requests?requestType=SmallMove&pickupCityCode=5000&destinationCityCode=4000&budgetBand=Unknown&moveDate={today.AddDays(1):yyyy-MM-dd}", ApiJson.Options))!;
        Assert.Equal(second.Id, Assert.Single(filtered.Items).Id);
        var empty = (await client.GetFromJsonAsync<MarketplacePageDto>("/api/v1/marketplace/requests?page=99", ApiJson.Options))!;
        Assert.Equal(3, empty.TotalCount);
        Assert.Empty(empty.Items);
    }

    [Theory]
    [InlineData("draft")]
    [InlineData("published")]
    [InlineData("closed")]
    [InlineData("cancelled")]
    [InlineData("expired")]
    [InlineData("sales-closed")]
    [InlineData("past")]
    [InlineData("no-published-at")]
    [InlineData("no-version")]
    [InlineData("type-mismatch")]
    [InlineData("unverified-owner")]
    [InlineData("suspended-owner")]
    [InlineData("owner-role")]
    [InlineData("old-policy")]
    [InlineData("no-consent")]
    [InlineData("wrong-consent-version")]
    [InlineData("wrong-consent-owner")]
    [InlineData("old-disclosure")]
    [InlineData("wrong-limit")]
    [InlineData("wrong-test-mode")]
    [InlineData("negative-buyers")]
    [InlineData("zero-max")]
    [InlineData("empty-address")]
    [InlineData("no-small-item")]
    [InlineData("invalid-enum")]
    public async Task IneligibleRequestIsAbsentFromListAndReturnsNotFound(string state)
    {
        using var client = await Viewer();
        var request = await Seed();
        await Mutate(request.Id, (db, row) => MarketplaceTestData.MakeIneligible(db, row, state));
        var list = (await client.GetFromJsonAsync<MarketplacePageDto>("/api/v1/marketplace/requests", ApiJson.Options))!;
        Assert.Empty(list.Items);
        Assert.Equal(0, list.TotalCount);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/marketplace/requests/{request.Id}")).StatusCode);
    }

    [Fact]
    public async Task ReadRateLimitIsPerAuthenticatedUserAndReturnsRetryAndNoStore()
    {
        using var first = await Viewer();
        using var second = await Viewer();
        for (var index = 0; index < 60; index++) Assert.Equal(HttpStatusCode.OK, (await first.GetAsync("/api/v1/marketplace/requests")).StatusCode);
        using var limited = await first.GetAsync("/api/v1/marketplace/requests");
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.Contains("RATE_LIMITED", await limited.Content.ReadAsStringAsync());
        Assert.NotNull(limited.Headers.RetryAfter);
        Assert.True(limited.Headers.CacheControl?.NoStore);
        Assert.Equal(HttpStatusCode.OK, (await second.GetAsync("/api/v1/marketplace/requests")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await first.GetAsync("/api/v1/localities")).StatusCode);
    }

    [Fact]
    public async Task LegalGateReturnsLiteralHttp503AndNoStoreForListAndDetail()
    {
        var gate = new SwitchableLegalGate();
        using var app = _factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services => services.AddSingleton<IConsentReleaseGate>(gate)));
        using var client = await Viewer(app: app);
        gate.Blocked = true;
        foreach (var url in new[] { "/api/v1/marketplace/requests", $"/api/v1/marketplace/requests/{Guid.NewGuid()}" })
        {
            using var response = await client.GetAsync(url);
            Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
            Assert.Contains("LEGAL_NOT_READY", await response.Content.ReadAsStringAsync());
            Assert.True(response.Headers.CacheControl?.NoStore);
        }
    }

    private sealed class SwitchableLegalGate : IConsentReleaseGate
    {
        public bool Blocked { get; set; }
        public void EnsureAvailable()
        {
            if (Blocked) ConsentPolicy.EnsureAvailable(new Microsoft.Extensions.Hosting.Internal.HostingEnvironment { EnvironmentName = "Production" });
        }
    }

    private async Task<HttpClient> Viewer(UserRole role = UserRole.Mover, BusinessStatus? business = BusinessStatus.Verified, WebApplicationFactory<Program>? app = null)
    {
        var host = app ?? _factory;
        var client = host.CreateClient();
        var csrf = (await client.GetFromJsonAsync<CsrfReply>("/api/v1/auth/csrf"))!;
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf.RequestToken);
        var id = Guid.NewGuid().ToString("N");
        using var login = await client.PostAsJsonAsync("/api/v1/auth/google/sign-in", new GoogleSignInRequest($"dev-google:{id}:{id}@example.com:Viewer:Test", ConsentFixtures.Acceptance));
        login.EnsureSuccessStatusCode();
        var user = (await login.Content.ReadFromJsonAsync<CurrentUserDto>(ApiJson.Options))!;
        using var scope = host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        (await db.Users.FindAsync(user.Id))!.Role = role;
        if (business is { } status) db.Businesses.Add(new Business { Id = Guid.NewGuid(), OwnerUserId = user.Id, Status = status, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();
        return client;
    }
    private async Task<MoveRequest> Seed()
    {
        using var scope = _factory.Services.CreateScope();
        return await MarketplaceTestData.SeedAsync(scope.ServiceProvider.GetRequiredService<MovelyDbContext>());
    }
    private async Task Mutate(Guid id, Action<MovelyDbContext, MoveRequest> mutate)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        var row = await db.MoveRequests.Include(x => x.CurrentVersion).ThenInclude(x => x!.Locations).Include(x => x.CurrentVersion).ThenInclude(x => x!.Items).Include(x => x.CustomerUser).SingleAsync(x => x.Id == id);
        mutate(db, row);
        await db.SaveChangesAsync();
    }
    private static void AssertFields(JsonElement element, string[] names) => Assert.Equal(names.Order(), element.EnumerateObject().Select(x => x.Name).Order());
    private sealed record CsrfReply(string RequestToken);
}

internal static class MarketplaceTestData
{
    public const string PrivateMarker = "PRIVATE_MARKETPLACE_SENTINEL";
    public static readonly string[] CardFields = ["id", "requestType", "pickupCity", "destinationCity", "moveDate", "publishedAt", "budgetBand", "numberOfRooms", "boxCount", "itemCount", "leadSalesStatus"];

    public static async Task<MoveRequest> SeedAsync(MovelyDbContext db, DateTimeOffset? now = null)
    {
        var timestamp = now ?? DateTimeOffset.UtcNow;
        var user = new MovelyUser { Id = Guid.NewGuid(), FirstName = PrivateMarker, LastName = PrivateMarker,
            Email = PrivateMarker + "@example.com", Phone = PrivateMarker, PhoneVerified = true, Role = UserRole.Customer, Status = UserStatus.Active,
            CreatedAt = timestamp, UpdatedAt = timestamp };
        db.Users.Add(user);
        ConsentPolicy.Add(db, user.Id, timestamp);
        var request = new MoveRequest { Id = Guid.NewGuid(), CustomerUserId = user.Id, RequestType = MoveRequestType.SmallMove,
            Status = MoveRequestStatus.Active, LeadSalesStatus = LeadSalesStatus.Available, MaxLeadBuyers = 3, LeadPriceAgorot = 999,
            PublishedAt = timestamp, CreatedAt = timestamp, UpdatedAt = timestamp };
        db.MoveRequests.Add(request);
        await db.SaveChangesAsync();
        var version = new MoveRequestVersion { Id = Guid.NewGuid(), MoveRequestId = request.Id, CreatedByUserId = user.Id,
            CreatedAt = timestamp, VersionNumber = 1, RequestType = request.RequestType, CustomerComment = PrivateMarker,
            MoveDate = BusinessCalendar.Today(timestamp).AddDays(14), PreferredTime = PreferredMoveTime.Morning, DateFlexibility = MoveDateFlexibility.Exact,
            BudgetBand = MoveBudgetBand.Unknown, SmallBoxCount = 1, MediumBoxCount = 2, LargeBoxCount = 3,
            FurnitureAssembly = true,
            Locations = [Location(MoveLocationType.Pickup, "5000"), Location(MoveLocationType.Destination, "4000")],
            Items = [
                new MoveItem { Id = Guid.NewGuid(), Kind = MoveItemKind.SmallMoveItem, SmallMoveCategory = SmallMoveItemCategory.Furniture, Name = PrivateMarker, Description = PrivateMarker, Quantity = 2, LengthCm = 100, WidthCm = 60, HeightCm = 75, ApproximateWeightKg = 10 },
                new MoveItem { Id = Guid.NewGuid(), Kind = MoveItemKind.SpecialItem, SpecialItemType = SpecialItemType.Piano, Name = PrivateMarker, Description = PrivateMarker, Quantity = 3, ApproximateWeightKg = 200 },
            ],
            Photos = [new MovePhoto { Id = Guid.NewGuid(), ObjectKey = PrivateMarker, OriginalFileName = PrivateMarker, ContentType = "image/jpeg", SizeBytes = 1000, CreatedAt = timestamp }],
        };
        db.MoveRequestVersions.Add(version);
        request.CurrentVersion = version;
        db.ContactSharingAcceptances.Add(new ContactSharingAcceptance { Id = Guid.NewGuid(), UserId = user.Id, MoveRequestId = request.Id,
            RequestVersionId = version.Id, DisclosureVersion = ConsentPolicy.Version, MaxRecipients = request.MaxLeadBuyers, IsTestOnly = ConsentPolicy.IsDraft, AcceptedAt = timestamp });
        await db.SaveChangesAsync();
        return request;
    }

    private static MoveLocation Location(MoveLocationType type, string code) => new() {
        Id = Guid.NewGuid(), LocationType = type, CanonicalLocalityCode = code, City = PrivateMarker, ExactAddress = PrivateMarker,
        Floor = 2, HasElevator = true, ElevatorFurnitureSuitability = ElevatorFurnitureSuitability.Yes, ParkingDistanceMeters = 5,
        StairsInfo = PrivateMarker, TruckAccessInfo = PrivateMarker,
    };

    public static void MakeIneligible(MovelyDbContext db, MoveRequest row, string state)
    {
        var consent = db.ContactSharingAcceptances.Single(x => x.MoveRequestId == row.Id);
        switch (state)
        {
            case "draft": row.Status = MoveRequestStatus.Draft; break;
            case "published": row.Status = MoveRequestStatus.Published; break;
            case "closed": row.Status = MoveRequestStatus.Closed; break;
            case "cancelled": row.Status = MoveRequestStatus.Cancelled; break;
            case "expired": row.Status = MoveRequestStatus.Expired; break;
            case "sales-closed": row.LeadSalesStatus = LeadSalesStatus.Closed; break;
            case "past": row.CurrentVersion!.MoveDate = BusinessCalendar.Today(DateTimeOffset.UtcNow).AddDays(-1); break;
            case "no-published-at": row.PublishedAt = null; break;
            case "no-version": row.CurrentVersion = null; row.CurrentVersionId = null; break;
            case "type-mismatch": row.RequestType = MoveRequestType.ApartmentMove; break;
            case "unverified-owner": row.CustomerUser!.PhoneVerified = false; break;
            case "suspended-owner": row.CustomerUser!.Status = UserStatus.Suspended; break;
            case "owner-role": row.CustomerUser!.Role = UserRole.Mover; break;
            case "old-policy": db.PolicyAcceptances.Single(x => x.UserId == row.CustomerUserId).PrivacyVersion = "old"; break;
            case "no-consent": db.ContactSharingAcceptances.Remove(consent); break;
            case "wrong-consent-version": consent.RequestVersionId = Guid.NewGuid(); break;
            case "wrong-consent-owner": consent.UserId = Guid.NewGuid(); break;
            case "old-disclosure": consent.DisclosureVersion = "old"; break;
            case "wrong-limit": consent.MaxRecipients++; break;
            case "wrong-test-mode": consent.IsTestOnly = !ConsentPolicy.IsDraft; break;
            case "negative-buyers": row.ActiveBuyerCount = -1; break;
            case "zero-max": row.MaxLeadBuyers = 0; break;
            case "empty-address": row.CurrentVersion!.Locations.First().ExactAddress = " \t "; break;
            case "no-small-item": foreach (var item in row.CurrentVersion!.Items) item.Kind = MoveItemKind.SpecialItem; break;
            case "invalid-enum": row.CurrentVersion!.PreferredTime = (PreferredMoveTime)999; break;
        }
    }

    public static async Task<Guid> SeedViewerAsync(MovelyDbContext db)
    {
        var user = new MovelyUser { Id = Guid.NewGuid(), Role = UserRole.Mover, Status = UserStatus.Active,
            FirstName = "Viewer", LastName = "Test", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
        db.Users.Add(user);
        ConsentPolicy.Add(db, user.Id, DateTimeOffset.UtcNow);
        await db.SaveChangesAsync();
        return user.Id;
    }

    public static MarketplaceService Service(MovelyDbContext db, Guid viewer, DateTimeOffset? now = null, IConsentReleaseGate? gate = null)
        => new(db, new FrozenClock(now ?? DateTimeOffset.UtcNow), gate ?? new AllowGate(), new LocalityCatalog(), new ViewerIdentity(viewer));
    public static MarketplaceSearch Search() => new(null, null, null, null, null, MarketplaceSort.Newest, 1, 12);
    private sealed class FrozenClock(DateTimeOffset now) : IClock { public DateTimeOffset UtcNow => now; }
    private sealed class AllowGate : IConsentReleaseGate { public void EnsureAvailable() { } }
    private sealed class ViewerIdentity(Guid id) : ICurrentUser
    {
        public bool IsAuthenticated => true;
        public Guid? UserId => id;
        public string? FirstName => null;
        public string? LastName => null;
        public string? Email => null;
        public string? Phone => null;
        public bool PhoneVerified => false;
        public UserRole? Role => UserRole.Mover;
        public BusinessStatus? BusinessStatus => Movely.Api.Data.BusinessStatus.Verified;
        public SubscriptionStatus? SubscriptionStatus => null;
        public Guid? BusinessId => null;
        public Guid? SessionId => null;
    }
}

[Trait("Category", "Integration")]
public sealed class MarketplaceCalendarAndGateTests
{
    [Theory]
    [InlineData("2026-10-29T22:30:00Z", "2026-10-29", "2026-10-30")]
    [InlineData("2026-07-10T21:00:00Z", "2026-07-10", "2026-07-11")]
    public async Task IsraelCalendarExcludesYesterdayAtUtcEveningAndKeepsToday(string instant, string yesterday, string today)
    {
        await using var db = new MovelyDbContext(new DbContextOptionsBuilder<MovelyDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var now = DateTimeOffset.Parse(instant);
        var request = await MarketplaceTestData.SeedAsync(db, now);
        var viewer = await MarketplaceTestData.SeedViewerAsync(db);
        request.CurrentVersion!.MoveDate = DateOnly.Parse(yesterday);
        await db.SaveChangesAsync();
        var service = MarketplaceTestData.Service(db, viewer, now);
        Assert.Empty((await service.ListAsync(MarketplaceTestData.Search())).Items);
        request.CurrentVersion.MoveDate = DateOnly.Parse(today);
        await db.SaveChangesAsync();
        Assert.Single((await service.ListAsync(MarketplaceTestData.Search())).Items);
    }

    [Fact]
    public async Task LegalGatePrecedesReadQueriesAndDoesNotExposeSeededData()
    {
        await using var db = new MovelyDbContext(new DbContextOptionsBuilder<MovelyDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var service = MarketplaceTestData.Service(db, Guid.NewGuid(), gate: new ProductionGate());
        Assert.Equal("LEGAL_NOT_READY", (await Assert.ThrowsAsync<ApiException>(() => service.ListAsync(MarketplaceTestData.Search()))).ErrorCode);
        Assert.Equal("LEGAL_NOT_READY", (await Assert.ThrowsAsync<ApiException>(() => service.GetAsync(Guid.NewGuid()))).ErrorCode);
    }
    private sealed class ProductionGate : IConsentReleaseGate
    {
        public void EnsureAvailable() => ConsentPolicy.EnsureAvailable(new Microsoft.Extensions.Hosting.Internal.HostingEnvironment { EnvironmentName = "Production" });
    }
}
