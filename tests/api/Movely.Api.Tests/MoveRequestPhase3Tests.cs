using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Modules.Identity;
using Movely.Api.Modules.MoveRequests;

namespace Movely.Api.Tests;

[Trait("Category", "Integration")]
public sealed class MoveRequestPhase3Tests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public MoveRequestPhase3Tests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Request001_CustomerCanCreateDraft()
    {
        var client = await CreateSignedInClientAsync("request-001");

        var draft = await CreateDraftAsync(client, MoveRequestType.ApartmentMove);

        Assert.Equal(MoveRequestStatus.Draft, draft.Status);
        Assert.Equal(LeadSalesStatus.Closed, draft.LeadSalesStatus);
        Assert.Equal(1, draft.CurrentVersion?.VersionNumber);
    }

    [Fact]
    public async Task Request002_DraftIsOwnedByCreatingCustomer()
    {
        var client = await CreateSignedInClientAsync("request-002");
        var me = await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");

        var draft = await CreateDraftAsync(client, MoveRequestType.ApartmentMove);

        Assert.Equal(me!.Id, draft.CustomerUserId);
    }

    [Fact]
    public async Task Request003_CustomerCannotReadAnotherCustomersDraft()
    {
        var owner = await CreateSignedInClientAsync("request-003-owner");
        var other = await CreateSignedInClientAsync("request-003-other");
        var draft = await CreateDraftAsync(owner, MoveRequestType.ApartmentMove);

        var response = await other.GetAsync($"/api/v1/move-requests/{draft.Id}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Request004_CustomerCannotEditAnotherCustomersRequest()
    {
        var owner = await CreateSignedInClientAsync("request-004-owner");
        var other = await CreateSignedInClientAsync("request-004-other");
        var draft = await CreateDraftAsync(owner, MoveRequestType.ApartmentMove);

        await IssueCsrfTokenAsync(other);
        var response = await other.PutAsJsonAsync($"/api/v1/move-requests/{draft.Id}", ValidApartmentUpdate(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14))));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Request005_DraftMayBeIncomplete()
    {
        var client = await CreateSignedInClientAsync("request-005");

        var draft = await CreateDraftAsync(client, MoveRequestType.SmallMove);

        Assert.Equal(MoveRequestStatus.Draft, draft.Status);
        Assert.Null(draft.CurrentVersion?.Pickup);
        Assert.Null(draft.CurrentVersion?.Destination);
    }

    [Fact]
    public async Task Request006_IncompleteDraftCannotBePublished()
    {
        var client = await CreateSignedInClientAsync("request-006", phoneVerified: true);
        var draft = await CreateDraftAsync(client, MoveRequestType.ApartmentMove);

        await IssueCsrfTokenAsync(client);
        var response = await client.PostAsync($"/api/v1/move-requests/{draft.Id}/publish", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Request007_CustomerWithUnverifiedPhoneCannotPublish()
    {
        var client = await CreateSignedInClientAsync("request-007", phoneVerified: false);
        var draft = await CreateDraftAsync(client, MoveRequestType.ApartmentMove);
        await UpdateAsync(client, draft.Id, ValidApartmentUpdate(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14))));

        await IssueCsrfTokenAsync(client);
        var response = await client.PostAsync($"/api/v1/move-requests/{draft.Id}/publish", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Request008_VerifiedCustomerCanPublishValidApartmentMove()
    {
        var client = await CreateSignedInClientAsync("request-008", phoneVerified: true);
        var draft = await CreateDraftAsync(client, MoveRequestType.ApartmentMove);
        await UpdateAsync(client, draft.Id, ValidApartmentUpdate(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14))));

        var published = await PublishAsync(client, draft.Id);

        Assert.Equal(MoveRequestStatus.Active, published.MoveRequest.Status);
    }

    [Fact]
    public async Task Request009_VerifiedCustomerCanPublishValidSmallMove()
    {
        var client = await CreateSignedInClientAsync("request-009", phoneVerified: true);
        var draft = await CreateDraftAsync(client, MoveRequestType.SmallMove);
        await UpdateAsync(client, draft.Id, ValidSmallMoveUpdate(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(12))));

        var published = await PublishAsync(client, draft.Id);

        Assert.Equal(MoveRequestStatus.Active, published.MoveRequest.Status);
        Assert.Equal(MoveRequestType.SmallMove, published.MoveRequest.RequestType);
    }

    [Fact]
    public async Task Request010_PublishingProducesActiveRequestWithLeadSalesAvailable()
    {
        var client = await CreateSignedInClientAsync("request-010", phoneVerified: true);
        var draft = await CreateDraftAsync(client, MoveRequestType.ApartmentMove);
        await UpdateAsync(client, draft.Id, ValidApartmentUpdate(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14))));

        var published = await PublishAsync(client, draft.Id);

        Assert.Equal(MoveRequestStatus.Active, published.MoveRequest.Status);
        Assert.Equal(LeadSalesStatus.Available, published.MoveRequest.LeadSalesStatus);
        Assert.NotNull(published.MoveRequest.PublishedAt);
    }

    [Fact]
    public async Task Request011_ApartmentMovePersistsRoomBoxInventoryAndAccessData()
    {
        var client = await CreateSignedInClientAsync("request-011");
        var draft = await CreateDraftAsync(client, MoveRequestType.ApartmentMove);

        var updated = await UpdateAsync(client, draft.Id, ValidApartmentUpdate(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14))));

        Assert.Equal(4, updated.CurrentVersion!.ApartmentMove!.NumberOfRooms);
        Assert.Equal(2, updated.CurrentVersion.ApartmentMove.Boxes.Small);
        Assert.Contains(updated.CurrentVersion.ApartmentMove.InventoryItems!, x => x.ApartmentInventoryType == ApartmentInventoryItemType.Sofa && x.Quantity == 1);
        Assert.Equal(3, updated.CurrentVersion.Pickup!.Floor);
        Assert.True(updated.CurrentVersion.Pickup.HasElevator);
        Assert.Equal(ElevatorFurnitureSuitability.Yes, updated.CurrentVersion.Pickup.ElevatorFurnitureSuitability);
    }

    [Fact]
    public async Task Request012_SmallMovePersistsItemDimensionAndAccessData()
    {
        var client = await CreateSignedInClientAsync("request-012");
        var draft = await CreateDraftAsync(client, MoveRequestType.SmallMove);

        var updated = await UpdateAsync(client, draft.Id, ValidSmallMoveUpdate(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14))));

        var item = Assert.Single(updated.CurrentVersion!.SmallMoveItems);
        Assert.Equal(SmallMoveItemCategory.Furniture, item.SmallMoveCategory);
        Assert.Equal(210m, item.LengthCm);
        Assert.Equal(90m, item.WidthCm);
        Assert.Equal(75m, item.HeightCm);
        Assert.Equal(40m, item.ApproximateWeightKg);
        Assert.Equal("Haifa", updated.CurrentVersion.Destination!.City);
    }

    [Fact]
    public async Task Request013_MaterialEditCreatesNewMoveRequestVersion()
    {
        var client = await CreateSignedInClientAsync("request-013");
        var draft = await CreateDraftAsync(client, MoveRequestType.ApartmentMove);
        await UpdateAsync(client, draft.Id, ValidApartmentUpdate(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14))));

        var updated = await UpdateAsync(client, draft.Id, ValidApartmentUpdate(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(20))));

        Assert.Equal(3, updated.CurrentVersion!.VersionNumber);
    }

    [Fact]
    public async Task Request014_HistoricalVersionRemainsUnchanged()
    {
        var client = await CreateSignedInClientAsync("request-014");
        var draft = await CreateDraftAsync(client, MoveRequestType.ApartmentMove);
        var dateA = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14));
        var dateB = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(20));
        await UpdateAsync(client, draft.Id, ValidApartmentUpdate(dateA));
        await UpdateAsync(client, draft.Id, ValidApartmentUpdate(dateB));

        var versions = (await client.GetFromJsonAsync<List<MoveRequestVersionResponse>>($"/api/v1/move-requests/{draft.Id}/versions"))!;

        Assert.Equal(dateA, versions.Single(x => x.VersionNumber == 2).Schedule.MoveDate);
        Assert.Equal(dateB, versions.Single(x => x.VersionNumber == 3).Schedule.MoveDate);
    }

    [Fact]
    public async Task Request015_CurrentVersionPointsToLatestMaterialVersion()
    {
        var client = await CreateSignedInClientAsync("request-015");
        var draft = await CreateDraftAsync(client, MoveRequestType.ApartmentMove);
        await UpdateAsync(client, draft.Id, ValidApartmentUpdate(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14))));
        await UpdateAsync(client, draft.Id, ValidApartmentUpdate(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(20))));
        var latest = await UpdateAsync(client, draft.Id, ValidApartmentUpdate(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(25))));

        var current = await client.GetFromJsonAsync<MoveRequestResponse>($"/api/v1/move-requests/{draft.Id}");

        Assert.Equal(4, latest.CurrentVersion!.VersionNumber);
        Assert.Equal(latest.CurrentVersion.Id, current!.CurrentVersion!.Id);
    }

    [Fact]
    public async Task Request016_InvalidStateTransitionIsRejected()
    {
        var client = await CreateSignedInClientAsync("request-016");
        var draft = await CreateDraftAsync(client, MoveRequestType.ApartmentMove);

        await IssueCsrfTokenAsync(client);
        var response = await client.PostAsync($"/api/v1/move-requests/{draft.Id}/close", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Request017_CustomerCanCancelOwnActiveRequest()
    {
        var client = await CreateSignedInClientAsync("request-017", phoneVerified: true);
        var active = await CreatePublishedApartmentAsync(client, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14)));

        await IssueCsrfTokenAsync(client);
        var response = await client.PostAsync($"/api/v1/move-requests/{active.MoveRequest.Id}/cancel", null);
        response.EnsureSuccessStatusCode();
        var cancelled = await response.Content.ReadFromJsonAsync<MoveRequestResponse>();

        Assert.Equal(MoveRequestStatus.Cancelled, cancelled!.Status);
    }

    [Fact]
    public async Task Request018_CancelledRequestHasLeadSalesStatusClosed()
    {
        var client = await CreateSignedInClientAsync("request-018", phoneVerified: true);
        var active = await CreatePublishedApartmentAsync(client, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14)));

        await IssueCsrfTokenAsync(client);
        var response = await client.PostAsync($"/api/v1/move-requests/{active.MoveRequest.Id}/cancel", null);
        var cancelled = await response.Content.ReadFromJsonAsync<MoveRequestResponse>();

        Assert.Equal(LeadSalesStatus.Closed, cancelled!.LeadSalesStatus);
    }

    [Fact]
    public async Task Request019_CustomerCanCloseOwnActiveRequest()
    {
        var client = await CreateSignedInClientAsync("request-019", phoneVerified: true);
        var active = await CreatePublishedApartmentAsync(client, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14)));

        await IssueCsrfTokenAsync(client);
        var response = await client.PostAsync($"/api/v1/move-requests/{active.MoveRequest.Id}/close", null);
        response.EnsureSuccessStatusCode();
        var closed = await response.Content.ReadFromJsonAsync<MoveRequestResponse>();

        Assert.Equal(MoveRequestStatus.Closed, closed!.Status);
    }

    [Fact]
    public async Task Request020_ClosedRequestHasLeadSalesStatusClosed()
    {
        var client = await CreateSignedInClientAsync("request-020", phoneVerified: true);
        var active = await CreatePublishedApartmentAsync(client, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14)));

        await IssueCsrfTokenAsync(client);
        var response = await client.PostAsync($"/api/v1/move-requests/{active.MoveRequest.Id}/close", null);
        var closed = await response.Content.ReadFromJsonAsync<MoveRequestResponse>();

        Assert.Equal(LeadSalesStatus.Closed, closed!.LeadSalesStatus);
    }

    [Fact]
    public async Task Request021_LeadPriceIsServerAuthoritativeAndPersistedSafely()
    {
        var client = await CreateSignedInClientAsync("request-021");

        var apartment = await CreateDraftAsync(client, MoveRequestType.ApartmentMove);
        var small = await CreateDraftAsync(client, MoveRequestType.SmallMove);

        Assert.Equal("ILS", apartment.LeadPrice.Currency);
        Assert.Equal(1000, apartment.LeadPrice.AmountMinor);
        Assert.Equal(500, small.LeadPrice.AmountMinor);
    }

    [Fact]
    public async Task Request022_MaxLeadBuyersIsConfigurableAndPersisted()
    {
        var client = await CreateSignedInClientAsync("request-022");

        var draft = await CreateDraftAsync(client, MoveRequestType.ApartmentMove);

        Assert.Equal(3, draft.MaxLeadBuyers);
    }

    [Fact]
    public async Task Request023_PotentialDuplicateIsFlaggedButNotHardBlocked()
    {
        var client = await CreateSignedInClientAsync("request-023", phoneVerified: true);
        var date = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14));
        await CreatePublishedApartmentAsync(client, date, pickupCity: "Duplicate City");
        var duplicateDraft = await CreateDraftAsync(client, MoveRequestType.ApartmentMove);
        await UpdateAsync(client, duplicateDraft.Id, ValidApartmentUpdate(date.AddDays(1), pickupCity: "Duplicate City"));

        var publishedDuplicate = await PublishAsync(client, duplicateDraft.Id);

        Assert.True(publishedDuplicate.PotentialDuplicateExists);
        Assert.True(publishedDuplicate.MoveRequest.DuplicateRisk);
        Assert.Equal(MoveRequestStatus.Active, publishedDuplicate.MoveRequest.Status);
    }

    [Fact]
    public async Task Request024_ActiveRequestLimitIsEnforced()
    {
        var client = await CreateSignedInClientAsync("request-024", phoneVerified: true);
        await CreatePublishedApartmentAsync(client, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(10)));
        await CreatePublishedApartmentAsync(client, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(20)));
        await CreatePublishedApartmentAsync(client, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30)));
        var fourth = await CreateDraftAsync(client, MoveRequestType.ApartmentMove);
        await UpdateAsync(client, fourth.Id, ValidApartmentUpdate(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(40)), pickupCity: "Ashdod"));

        await IssueCsrfTokenAsync(client);
        var response = await client.PostAsync($"/api/v1/move-requests/{fourth.Id}/publish", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Request025_PhotoMetadataDoesNotContainImageBinaryData()
    {
        var client = await CreateSignedInClientAsync("request-025");
        var draft = await CreateDraftAsync(client, MoveRequestType.ApartmentMove);

        var updated = await UpdateAsync(client, draft.Id, ValidApartmentUpdate(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14)), includePhoto: true));

        var photo = Assert.Single(updated.CurrentVersion!.Photos);
        Assert.Equal("move-photos/request-025/photo-1.jpg", photo.ObjectKey);
        Assert.DoesNotContain(typeof(byte[]), typeof(MovePhoto).GetProperties().Select(x => x.PropertyType));
    }

    [Fact]
    public async Task Request026_ExactAddressesAreNotExposedThroughNonOwnerOrSummaryContracts()
    {
        var owner = await CreateSignedInClientAsync("request-026-owner", phoneVerified: true);
        var other = await CreateSignedInClientAsync("request-026-other");
        var active = await CreatePublishedApartmentAsync(owner, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14)));

        var otherRead = await other.GetAsync($"/api/v1/move-requests/{active.MoveRequest.Id}");
        var summaryJson = await owner.GetStringAsync("/api/v1/me/move-requests");

        Assert.Equal(HttpStatusCode.NotFound, otherRead.StatusCode);
        Assert.DoesNotContain("Herzl 1", summaryJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Dizengoff 2", summaryJson, StringComparison.OrdinalIgnoreCase);
    }

    private async Task<HttpClient> CreateSignedInClientAsync(string subject, bool phoneVerified = false)
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            HandleCookies = true,
            AllowAutoRedirect = false
        });

        await IssueCsrfTokenAsync(client);
        var signIn = await client.PostAsJsonAsync(
            "/api/v1/auth/google/sign-in",
            new GoogleSignInRequest($"dev-google:{subject}:{subject}@example.com:Phase:Three"));
        signIn.EnsureSuccessStatusCode();

        if (phoneVerified)
        {
            var me = await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            var user = await db.Users.SingleAsync(x => x.Id == me!.Id);
            user.Phone = "+972501111111";
            user.PhoneVerified = true;
            await db.SaveChangesAsync();
        }

        return client;
    }

    private static async Task IssueCsrfTokenAsync(HttpClient client)
    {
        var csrf = await client.GetFromJsonAsync<CsrfResponse>("/api/v1/auth/csrf");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf!.RequestToken);
    }

    private static async Task<MoveRequestResponse> CreateDraftAsync(HttpClient client, MoveRequestType type)
    {
        await IssueCsrfTokenAsync(client);
        var response = await client.PostAsJsonAsync("/api/v1/move-requests", new CreateMoveRequestRequest(type));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<MoveRequestResponse>())!;
    }

    private static async Task<MoveRequestResponse> UpdateAsync(HttpClient client, Guid requestId, UpdateMoveRequestRequest request)
    {
        await IssueCsrfTokenAsync(client);
        var response = await client.PutAsJsonAsync($"/api/v1/move-requests/{requestId}", request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<MoveRequestResponse>())!;
    }

    private static async Task<PublishMoveRequestResponse> PublishAsync(HttpClient client, Guid requestId)
    {
        await IssueCsrfTokenAsync(client);
        var response = await client.PostAsync($"/api/v1/move-requests/{requestId}/publish", null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<PublishMoveRequestResponse>())!;
    }

    private static async Task<PublishMoveRequestResponse> CreatePublishedApartmentAsync(HttpClient client, DateOnly date, string? pickupCity = null)
    {
        var draft = await CreateDraftAsync(client, MoveRequestType.ApartmentMove);
        await UpdateAsync(client, draft.Id, ValidApartmentUpdate(date, pickupCity: pickupCity ?? $"Tel Aviv {Guid.NewGuid():N}"));
        return await PublishAsync(client, draft.Id);
    }

    private static UpdateMoveRequestRequest ValidApartmentUpdate(DateOnly moveDate, string pickupCity = "Tel Aviv", bool includePhoto = false)
        => new(
            MoveRequestType.ApartmentMove,
            new MoveLocationDto(pickupCity, "Herzl 1", 3, true, ElevatorFurnitureSuitability.Yes, "Wide stairs", "Truck can stop outside", 20),
            new MoveLocationDto("Ramat Gan", "Dizengoff 2", 1, false, ElevatorFurnitureSuitability.Unknown, "One narrow staircase", "Parking across street", 50),
            new ApartmentMoveDetailsDto(
                4,
                new BoxCountsDto(2, 3, 4),
                [
                    new MoveItemDto(MoveItemKind.ApartmentInventory, ApartmentInventoryItemType.Sofa, null, null, "Sofa", "Three-seat sofa", 1, 210, 90, 80, 45)
                ],
                new AdditionalServicesDto(true, true, false, true)),
            null,
            [
                new MoveItemDto(MoveItemKind.SpecialItem, null, SpecialItemType.Piano, null, "Piano", "Upright piano", 1, null, null, null, 180)
            ],
            new MoveScheduleDto(moveDate, PreferredMoveTime.Morning, MoveDateFlexibility.Exact),
            MoveBudgetBand.From2000To3000,
            "Please call before arrival.",
            includePhoto
                ? [new MovePhotoDto("move-photos/request-025/photo-1.jpg", "photo-1.jpg", "image/jpeg", 12345, 1)]
                : []);

    private static UpdateMoveRequestRequest ValidSmallMoveUpdate(DateOnly moveDate)
        => new(
            MoveRequestType.SmallMove,
            new MoveLocationDto("Tel Aviv", "Allenby 10", 0, false, ElevatorFurnitureSuitability.Unknown, null, "Easy curb access", 10),
            new MoveLocationDto("Haifa", "Hadar 20", 2, true, ElevatorFurnitureSuitability.No, "Two flights possible", "Small truck only", 30),
            null,
            [
                new MoveItemDto(MoveItemKind.SmallMoveItem, null, null, SmallMoveItemCategory.Furniture, "Desk", "Wooden desk", 1, 210, 90, 75, 40)
            ],
            [],
            new MoveScheduleDto(moveDate, PreferredMoveTime.Afternoon, MoveDateFlexibility.PlusMinusOneDay),
            MoveBudgetBand.From1000To1500,
            "Small move only.",
            []);

    private sealed record CsrfResponse(string RequestToken);
}
