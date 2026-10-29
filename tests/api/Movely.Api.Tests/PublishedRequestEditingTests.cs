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
using Movely.Api.Shared.Time;

namespace Movely.Api.Tests;

public sealed class PublishedRequestEditingTests : IDisposable
{
    private readonly ApiFactory _factory = new();
    public void Dispose() => _factory.Dispose();

    [Theory]
    [InlineData(MoveRequestStatus.Active, MoveRequestType.ApartmentMove)]
    [InlineData(MoveRequestStatus.Active, MoveRequestType.SmallMove)]
    [InlineData(MoveRequestStatus.Published, MoveRequestType.ApartmentMove)]
    [InlineData(MoveRequestStatus.Published, MoveRequestType.SmallMove)]
    public async Task CompletePublishedEditReturnsSavedSnapshotAndPreservesSalesAndHistory(MoveRequestStatus status, MoveRequestType type)
    {
        var original = await Seed(type, status);
        using var client = await Owner(original.CustomerUserId);
        var body = Full(type, original) with { CustomerComment = "Edited description", Photos = original.CurrentVersion!.Photos, SpecialItems = original.CurrentVersion.SpecialItems };
        var originalHistory = await History(original.Id);
        using var response = await client.PutAsJsonAsync(Path(original.Id), body, ApiJson.Options);
        response.EnsureSuccessStatusCode();
        Assert.True(response.Headers.CacheControl?.NoStore);
        var updated = (await response.Content.ReadFromJsonAsync<MoveRequestResponse>(ApiJson.Options))!;
        AssertPreservedAggregate(original, updated);
        Assert.NotEqual(original.CurrentVersion.Id, updated.CurrentVersion!.Id);
        Assert.Equal(original.CurrentVersion.VersionNumber + 1, updated.CurrentVersion.VersionNumber);
        Assert.Equal(body.Pickup, updated.CurrentVersion.Pickup);
        Assert.Equal(body.Destination, updated.CurrentVersion.Destination);
        Assert.Equal(body.Schedule, updated.CurrentVersion.Schedule);
        Assert.Equal(body.CustomerComment, updated.CurrentVersion.CustomerComment);
        Assert.Equal(body.BudgetBand, updated.CurrentVersion.BudgetBand);
        Assert.Equal(Json(body.ApartmentMove), Json(updated.CurrentVersion.ApartmentMove));
        Assert.Equal(Json(body.SmallMoveItems), Json(updated.CurrentVersion.SmallMoveItems));
        Assert.Equal(Json(body.SpecialItems), Json(updated.CurrentVersion.SpecialItems));
        Assert.Equal(Json(body.Photos), Json(updated.CurrentVersion.Photos));
        var fetched = (await client.GetFromJsonAsync<MoveRequestResponse>(Path(original.Id), ApiJson.Options))!;
        Assert.Equal(Json(updated), Json(fetched));
        var currentHistory = await History(original.Id);
        foreach (var old in originalHistory) Assert.Equal(old.Value, currentHistory[old.Key]);
        Assert.Equal(originalHistory.Count + 1, currentHistory.Count);
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        var acceptance = await db.ContactSharingAcceptances.SingleAsync(x => x.RequestVersionId == updated.CurrentVersion.Id);
        Assert.Equal(original.CustomerUserId, acceptance.UserId);
        Assert.Equal(ConsentPolicy.Version, acceptance.DisclosureVersion);
        Assert.Equal(original.MaxLeadBuyers, acceptance.MaxRecipients);
        Assert.Equal(ConsentPolicy.IsDraft, acceptance.IsTestOnly);
        Assert.Equal(3, await db.MoveRequestVersions.CountAsync(x => x.MoveRequestId == original.Id));
        var oldVersion = await ActiveRequestTestData.Service(db).GetVersionAsync(original.CustomerUserId, original.Id, original.CurrentVersion.Id);
        Assert.Equal("Initial description", oldVersion.CustomerComment);
    }

    [Theory]
    [InlineData(MoveRequestStatus.Active, MoveRequestType.ApartmentMove, MoveRequestType.SmallMove)]
    [InlineData(MoveRequestStatus.Active, MoveRequestType.SmallMove, MoveRequestType.ApartmentMove)]
    [InlineData(MoveRequestStatus.Published, MoveRequestType.ApartmentMove, MoveRequestType.SmallMove)]
    [InlineData(MoveRequestStatus.Published, MoveRequestType.SmallMove, MoveRequestType.ApartmentMove)]
    public async Task TypeChangeReplacesTypeSpecificContentWithoutRepricingOrReopening(MoveRequestStatus status, MoveRequestType previous, MoveRequestType target)
    {
        var original = await Seed(previous, status);
        using var owner = await Owner(original.CustomerUserId);
        using var response = await owner.PutAsJsonAsync(Path(original.Id), Full(target, original), ApiJson.Options);
        response.EnsureSuccessStatusCode();
        var updated = (await response.Content.ReadFromJsonAsync<MoveRequestResponse>(ApiJson.Options))!;
        Assert.Equal(target, updated.RequestType);
        Assert.Equal(target, updated.CurrentVersion!.RequestType);
        AssertPreservedAggregate(original, updated);
        if (target == MoveRequestType.SmallMove) {
            Assert.Null(updated.CurrentVersion.ApartmentMove);
            Assert.Single(updated.CurrentVersion.SmallMoveItems);
        } else {
            Assert.NotNull(updated.CurrentVersion.ApartmentMove);
            Assert.Empty(updated.CurrentVersion.SmallMoveItems);
        }
        var old = (await owner.GetFromJsonAsync<MoveRequestVersionResponse>($"{Path(original.Id)}/versions/{original.CurrentVersion!.Id}", ApiJson.Options))!;
        Assert.Equal(previous, old.RequestType);
    }

    [Fact]
    public async Task EditCanRepairInvalidDateAndContentEvenWhenConsentRenewalIsUnavailable()
    {
        var original = await Seed(MoveRequestType.SmallMove);
        await Mutate(db => {
            var version = db.MoveRequestVersions.Single(x => x.Id == original.CurrentVersion!.Id);
            version.MoveDate = BusinessCalendar.Today(DateTimeOffset.UtcNow).AddDays(-1);
            db.MoveItems.RemoveRange(db.MoveItems.Where(x => x.MoveRequestVersionId == version.Id));
        });
        using var owner = await Owner(original.CustomerUserId);
        var before = (await owner.GetFromJsonAsync<RequestPublicationStatusDto>($"{Path(original.Id)}/publication-status", ApiJson.Options))!;
        Assert.False(before.CanRenewContactSharing);
        Assert.Contains("MOVE_DATE_INVALID", before.Blockers);
        Assert.Contains("REQUEST_INCOMPLETE", before.Blockers);
        using var response = await owner.PutAsJsonAsync(Path(original.Id), Full(MoveRequestType.SmallMove, original), ApiJson.Options);
        response.EnsureSuccessStatusCode();
        var after = (await owner.GetFromJsonAsync<RequestPublicationStatusDto>($"{Path(original.Id)}/publication-status", ApiJson.Options))!;
        Assert.True(after.EligibleForMarketplace);
        Assert.False(after.CanRenewContactSharing);
    }

    [Theory]
    [InlineData("anonymous", 401)]
    [InlineData("other-owner", 404)]
    [InlineData("mover", 403)]
    [InlineData("admin", 403)]
    [InlineData("revoked-session", 401)]
    [InlineData("missing-csrf", 400)]
    public async Task PublishedPutCannotBypassOwnerRoleSessionOrCsrf(string access, int expectedStatus)
    {
        var original = await Seed(MoveRequestType.SmallMove);
        Guid caller = original.CustomerUserId;
        if (access == "other-owner") {
            using var scope = _factory.Services.CreateScope();
            caller = (await BusinessTestData.User(scope.ServiceProvider.GetRequiredService<MovelyDbContext>())).Id;
        }
        using var client = access == "anonymous" ? _factory.CreateClient() : await Owner(caller, csrf: access != "missing-csrf");
        if (access == "mover" || access == "admin")
            await Mutate(db => db.Users.Single(x => x.Id == caller).Role = access == "mover" ? UserRole.Mover : UserRole.Admin);
        if (access == "revoked-session") await Mutate(db => {
            foreach (var session in db.UserSessions.Where(x => x.UserId == caller)) session.RevokedAt = DateTimeOffset.UtcNow;
        });
        var before = await State(original);
        using var response = await client.PutAsJsonAsync(Path(original.Id), Full(MoveRequestType.SmallMove, original), ApiJson.Options);
        Assert.Equal(expectedStatus, (int)response.StatusCode);
        Assert.Equal(before, await State(original));
    }

    [Theory]
    [InlineData("stale-version", "REQUEST_VERSION_CONFLICT", 409)]
    [InlineData("missing-version", "REQUEST_VERSION_CONFLICT", 409)]
    [InlineData("closed", "INVALID_REQUEST_STATE", 400)]
    [InlineData("cancelled", "INVALID_REQUEST_STATE", 400)]
    [InlineData("expired", "INVALID_REQUEST_STATE", 400)]
    [InlineData("missing-route", "REQUEST_INCOMPLETE", 400)]
    [InlineData("missing-consent", "CONTACT_SHARING_REQUIRED", 400)]
    [InlineData("missing-items", "REQUEST_INCOMPLETE", 400)]
    [InlineData("negative-quantity", "INVALID_ITEM", 400)]
    [InlineData("past-date", "INVALID_MOVE_DATE", 400)]
    public async Task RejectedPublishedEditsLeaveEveryStoredSnapshotAndAcceptanceUnchanged(string invalid, string errorCode, int status)
    {
        var original = await Seed(MoveRequestType.SmallMove);
        using var owner = await Owner(original.CustomerUserId);
        if (invalid is "closed" or "cancelled" or "expired")
            await Mutate(db => db.MoveRequests.Single(x => x.Id == original.Id).Status = Enum.Parse<MoveRequestStatus>(invalid, true));
        var body = Full(MoveRequestType.SmallMove, original);
        body = invalid switch {
            "stale-version" => body with { ExpectedCurrentVersionId = Guid.NewGuid() },
            "missing-version" => body with { ExpectedCurrentVersionId = null },
            "missing-route" => body with { Pickup = null },
            "missing-consent" => body with { ContactSharing = null },
            "missing-items" => body with { SmallMoveItems = [] },
            "negative-quantity" => body with { SmallMoveItems = [body.SmallMoveItems![0] with { Quantity = -1 }] },
            "past-date" => body with { Schedule = body.Schedule! with { MoveDate = BusinessCalendar.Today(DateTimeOffset.UtcNow).AddDays(-1) } },
            _ => body,
        };
        var before = await State(original);
        using var response = await owner.PutAsJsonAsync(Path(original.Id), body, ApiJson.Options);
        Assert.Equal(status, (int)response.StatusCode);
        Assert.Contains(errorCode, await response.Content.ReadAsStringAsync());
        Assert.Equal(before, await State(original));
    }

    [Theory]
    [InlineData("request-type", "INVALID_REQUEST_TYPE")]
    [InlineData("time", "INVALID_SCHEDULE")]
    [InlineData("flexibility", "INVALID_SCHEDULE")]
    [InlineData("budget", "INVALID_BUDGET")]
    [InlineData("elevator", "INVALID_LOCATION")]
    [InlineData("item-kind", "INVALID_ITEM")]
    [InlineData("item-subtype", "INVALID_ITEM")]
    [InlineData("null-boxes", "INVALID_APARTMENT_DETAILS")]
    [InlineData("null-services", "INVALID_APARTMENT_DETAILS")]
    [InlineData("null-item", "INVALID_ITEM")]
    [InlineData("null-photo", "INVALID_PHOTO_METADATA")]
    [InlineData("nul-comment", "INVALID_TEXT")]
    [InlineData("control-address", "INVALID_TEXT")]
    [InlineData("nul-photo-key", "INVALID_PHOTO_METADATA")]
    public async Task MalformedPublishedPayloadReturnsControlled400WithoutMutations(string malformed, string errorCode)
    {
        var original = await Seed(MoveRequestType.ApartmentMove);
        using var owner = await Owner(original.CustomerUserId);
        var body = Full(MoveRequestType.ApartmentMove, original);
        body = malformed switch {
            "request-type" => body with { RequestType = (MoveRequestType)999 },
            "time" => body with { Schedule = body.Schedule! with { PreferredTime = (PreferredMoveTime)999 } },
            "flexibility" => body with { Schedule = body.Schedule! with { DateFlexibility = (MoveDateFlexibility)999 } },
            "budget" => body with { BudgetBand = (MoveBudgetBand)999 },
            "elevator" => body with { Pickup = body.Pickup! with { ElevatorFurnitureSuitability = (ElevatorFurnitureSuitability)999 } },
            "item-kind" => body with { SpecialItems = [body.SpecialItems![0] with { Kind = (MoveItemKind)999 }] },
            "item-subtype" => body with { SpecialItems = [body.SpecialItems![0] with { SpecialItemType = (SpecialItemType)999 }] },
            "null-boxes" => body with { ApartmentMove = body.ApartmentMove! with { Boxes = null! } },
            "null-services" => body with { ApartmentMove = body.ApartmentMove! with { AdditionalServices = null! } },
            "null-item" => body with { SpecialItems = [null!] },
            "null-photo" => body with { Photos = [null!] },
            "nul-comment" => body with { CustomerComment = "Comment\0" },
            "control-address" => body with { Pickup = body.Pickup! with { ExactAddress = "Address\v" } },
            _ => body with { Photos = [body.Photos![0] with { ObjectKey = "private/\0photo.jpg" }] },
        };
        var before = await State(original);
        using var response = await owner.PutAsJsonAsync(Path(original.Id), body, ApiJson.Options);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(errorCode, await response.Content.ReadAsStringAsync());
        Assert.Equal(before, await State(original));
    }

    [Fact]
    public async Task ValidMultilineDescriptionAndAccessNotesRoundTrip()
    {
        var original = await Seed(MoveRequestType.SmallMove);
        using var owner = await Owner(original.CustomerUserId);
        const string text = "First line\r\n\tSecond line\nThird line";
        var body = Full(MoveRequestType.SmallMove, original) with { CustomerComment = text };
        body = body with { Pickup = body.Pickup! with { StairsInfo = text, TruckAccessInfo = text }, SpecialItems = [body.SpecialItems![0] with { Description = text }] };
        using var response = await owner.PutAsJsonAsync(Path(original.Id), body, ApiJson.Options);
        response.EnsureSuccessStatusCode();
        var saved = (await response.Content.ReadFromJsonAsync<MoveRequestResponse>(ApiJson.Options))!.CurrentVersion!;
        Assert.Equal(text, saved.CustomerComment);
        Assert.Equal(text, saved.Pickup!.StairsInfo);
        Assert.Equal(text, saved.SpecialItems[0].Description);
    }

    private async Task<MoveRequestResponse> Seed(MoveRequestType type, MoveRequestStatus status = MoveRequestStatus.Active)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        var owner = await BusinessTestData.User(db);
        var service = ActiveRequestTestData.Service(db);
        var draft = await service.CreateDraftAsync(owner.Id, new(type));
        await service.UpdateOwnedAsync(owner.Id, draft.Id, Full(type) with { CustomerComment = "Initial description" });
        var published = (await service.PublishOwnedAsync(owner.Id, draft.Id, ConsentFixtures.Sharing)).MoveRequest;
        var row = (await db.MoveRequests.FindAsync(published.Id))!;
        row.Status = status;
        row.LeadSalesStatus = LeadSalesStatus.SoldOut;
        row.MaxLeadBuyers = 5;
        row.ActiveBuyerCount = 5;
        row.LeadPriceAgorot = 2777;
        await db.SaveChangesAsync();
        return await service.GetOwnedAsync(owner.Id, published.Id);
    }

    private static UpdateMoveRequestRequest Full(MoveRequestType type, MoveRequestResponse? original = null)
    {
        var small = new MoveItemDto(MoveItemKind.SmallMoveItem, null, null, SmallMoveItemCategory.Furniture, "Desk", "Desk description", 2, 100, 60, 70, 15);
        var inventory = new MoveItemDto(MoveItemKind.ApartmentInventory, ApartmentInventoryItemType.Sofa, null, null, "Sofa", "Sofa description", 1, 210, 80, 90, 70);
        var special = new MoveItemDto(MoveItemKind.SpecialItem, null, SpecialItemType.Piano, null, "Piano", "Piano description", 1, 150.5m, 50, 105, 250.25m);
        return new(type,
            new("תל אביב - יפו", "Pickup street 12", 2, true, ElevatorFurnitureSuitability.Yes, "Wide stairs", "Truck access", 10),
            new("חיפה", "Destination street 24", 3, false, ElevatorFurnitureSuitability.No, "Stairs", "Nearby parking", 20),
            type == MoveRequestType.ApartmentMove ? new(4, new(2, 3, 4), [inventory], new(true, false, true, false)) : null,
            type == MoveRequestType.SmallMove ? [small] : [], [special],
            new(BusinessCalendar.Today(DateTimeOffset.UtcNow).AddDays(20), PreferredMoveTime.Afternoon, MoveDateFlexibility.PlusMinusOneDay),
            MoveBudgetBand.From3000To5000, "Edited description", [new("private/owner/photo.jpg", "photo.jpg", "image/jpeg", 4096, 0)],
            original?.CurrentVersion?.Id, original is null ? null : new(true, ConsentPolicy.Version, original.MaxLeadBuyers));
    }
    private static void AssertPreservedAggregate(MoveRequestResponse original, MoveRequestResponse updated)
    {
        Assert.Equal(original.Status, updated.Status);
        Assert.Equal(original.LeadSalesStatus, updated.LeadSalesStatus);
        Assert.Equal(original.MaxLeadBuyers, updated.MaxLeadBuyers);
        Assert.Equal(original.ActiveBuyerCount, updated.ActiveBuyerCount);
        Assert.Equal(original.LeadPrice, updated.LeadPrice);
        Assert.Equal(original.PublishedAt, updated.PublishedAt);
        Assert.Equal(original.CustomerUserId, updated.CustomerUserId);
    }
    private async Task<HttpClient> Owner(Guid id, bool csrf = true)
    {
        using var scope = _factory.Services.CreateScope();
        var token = await scope.ServiceProvider.GetRequiredService<ISessionService>().CreateSessionAsync(id);
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false, AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add("Cookie", $"movely.session={token}");
        if (csrf) {
            using var response = await client.GetAsync("/api/v1/auth/csrf");
            response.EnsureSuccessStatusCode();
            var cookie = response.Headers.GetValues("Set-Cookie").Select(x => x.Split(';')[0]).Single(x => x.StartsWith("movely.csrf=", StringComparison.Ordinal));
            client.DefaultRequestHeaders.Remove("Cookie");
            client.DefaultRequestHeaders.Add("Cookie", $"movely.session={token}; {cookie}");
            client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", (await response.Content.ReadFromJsonAsync<CsrfReply>())!.RequestToken);
        }
        return client;
    }
    private async Task Mutate(Action<MovelyDbContext> action)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        action(db); await db.SaveChangesAsync();
    }
    private async Task<Dictionary<Guid, string>> History(Guid id)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        return (await db.ContactSharingAcceptances.AsNoTracking().Where(x => x.MoveRequestId == id).ToListAsync())
            .ToDictionary(x => x.Id, Json);
    }
    private async Task<string> State(MoveRequestResponse request)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        var service = ActiveRequestTestData.Service(db);
        return Json(new { Request = await service.GetOwnedAsync(request.CustomerUserId, request.Id), Versions = await service.ListVersionsAsync(request.CustomerUserId, request.Id), Consents = (await History(request.Id)).OrderBy(x => x.Key).ToArray() });
    }
    private static string Json<T>(T value) => JsonSerializer.Serialize(value, ApiJson.Options);
    private static string Path(Guid id) => $"/api/v1/move-requests/{id}";
    private sealed record CsrfReply(string RequestToken);
}
