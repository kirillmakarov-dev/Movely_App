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
using Movely.Api.Modules.MoveRequests;

namespace Movely.Api.Tests;

[Trait("Category", "Integration")]
public sealed class RequestPublicationAccessTests : IDisposable
{
    private readonly ApiFactory _factory = new();
    public void Dispose() => _factory.Dispose();

    [Fact]
    public async Task StatusIsOwnerOnlyMetadataWithoutPrivateFieldsOrApplicationSideEffects()
    {
        var request = await Seed();
        using var owner = await Session(request.CustomerUserId);
        using var viewer = await Viewer();
        var before = await State(request.Id);
        using var response = await owner.GetAsync(StatusPath(request.Id));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        var json = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain(MarketplaceTestData.PrivateMarker, json);
        using var data = JsonDocument.Parse(json);
        var status = data.RootElement;
        Assert.Equal(new[] {
            "blockers", "canRenewContactSharing", "checkedAt", "contactSharingAcceptedAt", "currentVersionId", "disclosureVersion",
            "eligibleForMarketplace", "hasCurrentContactSharing", "isTestOnly", "leadSalesStatus", "maxRecipients", "requestId", "requestStatus"
        }.Order(), status.EnumerateObject().Select(x => x.Name).Order());
        Assert.Equal(request.Id, status.GetProperty("requestId").GetGuid());
        Assert.Equal(request.CurrentVersionId, status.GetProperty("currentVersionId").GetGuid());
        Assert.Equal("Active", status.GetProperty("requestStatus").GetString());
        Assert.True(status.GetProperty("eligibleForMarketplace").GetBoolean());
        Assert.True(status.GetProperty("hasCurrentContactSharing").GetBoolean());
        Assert.False(status.GetProperty("canRenewContactSharing").GetBoolean());
        Assert.Empty(status.GetProperty("blockers").EnumerateArray());
        Assert.Equal(HttpStatusCode.OK, (await viewer.GetAsync(MarketPath(request.Id))).StatusCode);
        Assert.Equal(before, await State(request.Id));
    }

    [Theory]
    [InlineData(null, 401)]
    [InlineData(UserRole.Customer, 404)]
    [InlineData(UserRole.Mover, 403)]
    [InlineData(UserRole.Admin, 403)]
    public async Task UnknownAndForeignRequestsDoNotDisclosePublicationStateOrAcceptConsent(UserRole? role, int expected)
    {
        var request = await Seed();
        using var client = role is null ? _factory.CreateClient() : await NewAccount(role.Value);
        if (role is not null) await Csrf(client);
        var before = await State(request.Id);
        foreach (var id in new[] { request.Id, Guid.NewGuid() })
        {
            using var get = await client.GetAsync(StatusPath(id));
            using var post = await client.PostAsJsonAsync(RenewPath(id), Payload(request));
            foreach (var response in new[] { get, post })
            {
                Assert.Equal(expected, (int)response.StatusCode);
                Assert.True(response.Headers.CacheControl?.NoStore);
                var json = await response.Content.ReadAsStringAsync();
                Assert.DoesNotContain(MarketplaceTestData.PrivateMarker, json);
                Assert.DoesNotContain("eligibleForMarketplace", json);
                Assert.DoesNotContain("contactSharingAcceptedAt", json);
                if (role == UserRole.Customer) Assert.Contains("MOVE_REQUEST_NOT_FOUND", json);
            }
        }
        Assert.Equal(before, await State(request.Id));
    }

    [Fact]
    public async Task RenewalRequiresRealAntiforgeryAndCannotMutateThroughGet()
    {
        var request = await Seed();
        await Mutate(db => db.ContactSharingAcceptances.Single(x => x.MoveRequestId == request.Id).DisclosureVersion = "old-disclosure");
        using var owner = await Session(request.CustomerUserId);
        var before = await State(request.Id);
        using var missing = await owner.PostAsJsonAsync(RenewPath(request.Id), Payload(request));
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        Assert.Contains("INVALID_CSRF_TOKEN", await missing.Content.ReadAsStringAsync());
        Assert.True(missing.Headers.CacheControl?.NoStore);
        using var wrongMethod = await owner.GetAsync(RenewPath(request.Id));
        Assert.Equal(HttpStatusCode.MethodNotAllowed, wrongMethod.StatusCode);
        Assert.Equal(before, await State(request.Id));
        await Csrf(owner);
        using var accepted = await owner.PostAsJsonAsync(RenewPath(request.Id), Payload(request));
        accepted.EnsureSuccessStatusCode();
    }

    [Theory]
    [InlineData("disclosure")]
    [InlineData("recipients")]
    public async Task RenewalRestoresSameMarketplaceRequestAndPreservesContentAndConsentHistory(string changed)
    {
        var request = await Seed();
        await Mutate(db => {
            if (changed == "disclosure") db.ContactSharingAcceptances.Single(x => x.MoveRequestId == request.Id).DisclosureVersion = "old-disclosure";
            else db.MoveRequests.Single(x => x.Id == request.Id).MaxLeadBuyers = 2;
        });
        var max = changed == "recipients" ? 2 : request.MaxLeadBuyers;
        using var owner = await Session(request.CustomerUserId);
        using var viewer = await Viewer();
        await Csrf(owner);
        var before = (await owner.GetFromJsonAsync<MoveRequestResponse>($"/api/v1/move-requests/{request.Id}", ApiJson.Options))!;
        var versionJson = JsonSerializer.Serialize(before.CurrentVersion, ApiJson.Options);
        var historic = await ConsentRows(request.Id);
        using var statusBefore = await Status(owner, request.Id);
        Assert.False(statusBefore.RootElement.GetProperty("eligibleForMarketplace").GetBoolean());
        Assert.True(statusBefore.RootElement.GetProperty("canRenewContactSharing").GetBoolean());
        Assert.Equal(HttpStatusCode.NotFound, (await viewer.GetAsync(MarketPath(request.Id))).StatusCode);
        using var response = await owner.PostAsJsonAsync(RenewPath(request.Id), Payload(request, max));
        response.EnsureSuccessStatusCode();
        Assert.True(response.Headers.CacheControl?.NoStore);
        var responseJson = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain(MarketplaceTestData.PrivateMarker, responseJson);
        using var renewed = JsonDocument.Parse(responseJson);
        Assert.False(renewed.RootElement.GetProperty("alreadyAccepted").GetBoolean());
        Assert.True(renewed.RootElement.GetProperty("publicationStatus").GetProperty("eligibleForMarketplace").GetBoolean());
        var after = (await owner.GetFromJsonAsync<MoveRequestResponse>($"/api/v1/move-requests/{request.Id}", ApiJson.Options))!;
        Assert.Equal(before.CurrentVersion!.Id, after.CurrentVersion!.Id);
        Assert.Equal(versionJson, JsonSerializer.Serialize(after.CurrentVersion, ApiJson.Options));
        Assert.Equal(before.PublishedAt, after.PublishedAt);
        Assert.Equal(before.Status, after.Status);
        Assert.Equal(before.LeadSalesStatus, after.LeadSalesStatus);
        var consent = await ConsentRows(request.Id);
        Assert.Equal(2, consent.Count);
        Assert.Equal(historic.Single().Value, consent[historic.Single().Key]);
        using var visible = await viewer.GetAsync(MarketPath(request.Id));
        Assert.Equal(HttpStatusCode.OK, visible.StatusCode);
        var publicJson = await visible.Content.ReadAsStringAsync();
        Assert.DoesNotContain(MarketplaceTestData.PrivateMarker, publicJson);
        Assert.DoesNotContain("contactSharingAcceptedAt", publicJson);
        Assert.DoesNotContain("customerUserId", publicJson);
        using var repeated = await owner.PostAsJsonAsync(RenewPath(request.Id), Payload(request, max));
        repeated.EnsureSuccessStatusCode();
        using var repeatJson = JsonDocument.Parse(await repeated.Content.ReadAsStringAsync());
        Assert.True(repeatJson.RootElement.GetProperty("alreadyAccepted").GetBoolean());
        Assert.Equal(consent.OrderBy(x => x.Key), (await ConsentRows(request.Id)).OrderBy(x => x.Key));
        using var scope = _factory.Services.CreateScope();
        Assert.Equal(1, await scope.ServiceProvider.GetRequiredService<MovelyDbContext>().MoveRequestVersions.CountAsync(x => x.MoveRequestId == request.Id));
    }

    [Theory]
    [InlineData("version", "REQUEST_VERSION_CONFLICT", 409)]
    [InlineData("disclosure", "POLICY_VERSION_CHANGED", 409)]
    [InlineData("recipients", "RECIPIENT_LIMIT_CHANGED", 409)]
    [InlineData("unchecked", "CONTACT_SHARING_REQUIRED", 400)]
    public async Task InvalidRenewalDoesNotChangeRequestVersionOrAcceptances(string invalid, string code, int status)
    {
        var request = await Seed();
        await Mutate(db => db.ContactSharingAcceptances.Single(x => x.MoveRequestId == request.Id).DisclosureVersion = "old-disclosure");
        using var owner = await Session(request.CustomerUserId);
        await Csrf(owner);
        var before = await State(request.Id);
        using var response = await owner.PostAsJsonAsync(RenewPath(request.Id), new {
            expectedCurrentVersionId = invalid == "version" ? Guid.NewGuid() : request.CurrentVersionId,
            contactSharing = new { shareContacts = invalid != "unchecked", disclosureVersion = invalid == "disclosure" ? "wrong-version" : ConsentPolicy.Version,
                maxRecipients = invalid == "recipients" ? request.MaxLeadBuyers + 1 : request.MaxLeadBuyers }
        });
        Assert.Equal(status, (int)response.StatusCode);
        Assert.Contains(code, await response.Content.ReadAsStringAsync());
        Assert.Equal(before, await State(request.Id));
    }

    [Theory]
    [InlineData(MoveRequestStatus.Draft)]
    [InlineData(MoveRequestStatus.Closed)]
    [InlineData(MoveRequestStatus.Cancelled)]
    [InlineData(MoveRequestStatus.Expired)]
    public async Task ConsentRenewalNeverReopensOrPublishesANonActiveRequest(MoveRequestStatus state)
    {
        var request = await Seed();
        await Mutate(db => {
            var row = db.MoveRequests.Single(x => x.Id == request.Id);
            row.Status = state; row.LeadSalesStatus = LeadSalesStatus.Closed;
            db.ContactSharingAcceptances.Single(x => x.MoveRequestId == request.Id).DisclosureVersion = "old-disclosure";
        });
        using var owner = await Session(request.CustomerUserId);
        await Csrf(owner);
        var before = await State(request.Id);
        using var status = await Status(owner, request.Id);
        Assert.False(status.RootElement.GetProperty("eligibleForMarketplace").GetBoolean());
        Assert.False(status.RootElement.GetProperty("canRenewContactSharing").GetBoolean());
        using var response = await owner.PostAsJsonAsync(RenewPath(request.Id), Payload(request));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(before, await State(request.Id));
    }

    [Fact]
    public async Task SoldOutAndUnrecognizedCitiesRemainVisibleWhenAllPublicationPrerequisitesHold()
    {
        var request = await Seed();
        await Mutate(db => {
            var row = db.MoveRequests.Single(x => x.Id == request.Id);
            row.LeadSalesStatus = LeadSalesStatus.SoldOut; row.ActiveBuyerCount = row.MaxLeadBuyers;
            foreach (var location in db.MoveLocations.Where(x => x.MoveRequestVersionId == request.CurrentVersionId)) location.CanonicalLocalityCode = null;
        });
        using var owner = await Session(request.CustomerUserId);
        using var viewer = await Viewer();
        using var status = await Status(owner, request.Id);
        Assert.True(status.RootElement.GetProperty("eligibleForMarketplace").GetBoolean());
        using var visible = await viewer.GetAsync(MarketPath(request.Id));
        visible.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await visible.Content.ReadAsStringAsync());
        Assert.Equal("SoldOut", json.RootElement.GetProperty("leadSalesStatus").GetString());
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("pickupCity").ValueKind);
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("destinationCity").ValueKind);
    }

    [Theory]
    [InlineData("phone", "PHONE_NOT_VERIFIED")]
    [InlineData("policy", "POLICY_ACCEPTANCE_REQUIRED")]
    public async Task RenewalCannotReplaceMissingAccountPrerequisites(string missing, string errorCode)
    {
        var request = await Seed();
        await Mutate(db => {
            db.ContactSharingAcceptances.Single(x => x.MoveRequestId == request.Id).DisclosureVersion = "old-disclosure";
            if (missing == "phone") db.Users.Single(x => x.Id == request.CustomerUserId).PhoneVerified = false;
            else db.PolicyAcceptances.Single(x => x.UserId == request.CustomerUserId).TermsVersion = "old-policy";
        });
        using var owner = await Session(request.CustomerUserId);
        using var viewer = await Viewer();
        await Csrf(owner);
        var before = await State(request.Id);
        using var status = await Status(owner, request.Id);
        Assert.False(status.RootElement.GetProperty("eligibleForMarketplace").GetBoolean());
        Assert.False(status.RootElement.GetProperty("canRenewContactSharing").GetBoolean());
        using var refused = await owner.PostAsJsonAsync(RenewPath(request.Id), Payload(request));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains(errorCode, await refused.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await viewer.GetAsync(MarketPath(request.Id))).StatusCode);
        Assert.Equal(before, await State(request.Id));
    }

    [Fact]
    public async Task ForeignConsentAtTheUniqueKeyIsNotExposedOrSilentlyReassigned()
    {
        var request = await Seed();
        Guid foreignOwner;
        using (var scope = _factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            foreignOwner = (await BusinessTestData.User(db)).Id;
            (await db.ContactSharingAcceptances.SingleAsync(x => x.MoveRequestId == request.Id)).UserId = foreignOwner;
            await db.SaveChangesAsync();
        }
        using var owner = await Session(request.CustomerUserId);
        using var viewer = await Viewer();
        await Csrf(owner);
        var before = await State(request.Id);
        using var status = await Status(owner, request.Id);
        Assert.False(status.RootElement.GetProperty("canRenewContactSharing").GetBoolean());
        Assert.False(status.RootElement.GetProperty("eligibleForMarketplace").GetBoolean());
        Assert.Contains("CONTACT_SHARING_HISTORY_CONFLICT", status.RootElement.GetRawText());
        Assert.DoesNotContain(foreignOwner.ToString(), status.RootElement.GetRawText());
        using var refused = await owner.PostAsJsonAsync(RenewPath(request.Id), Payload(request));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        var error = await refused.Content.ReadAsStringAsync();
        Assert.Contains("CONTACT_SHARING_HISTORY_CONFLICT", error);
        Assert.DoesNotContain(foreignOwner.ToString(), error);
        Assert.Equal(HttpStatusCode.NotFound, (await viewer.GetAsync(MarketPath(request.Id))).StatusCode);
        Assert.Equal(before, await State(request.Id));
    }

    [Fact]
    public async Task ClosedLegalGateStillExplainsStatusButCannotPersistRenewal()
    {
        using var app = _factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            services.AddSingleton<IConsentReleaseGate>(new BusinessTestData.BlockLegal())));
        var request = await Seed(app);
        using var owner = await Session(request.CustomerUserId, app);
        await Csrf(owner);
        using var status = await Status(owner, request.Id);
        Assert.False(status.RootElement.GetProperty("eligibleForMarketplace").GetBoolean());
        Assert.False(status.RootElement.GetProperty("canRenewContactSharing").GetBoolean());
        Assert.Contains("LEGAL_NOT_READY", status.RootElement.GetRawText());
        using var refused = await owner.PostAsJsonAsync(RenewPath(request.Id), Payload(request));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, refused.StatusCode);
        Assert.True(refused.Headers.CacheControl?.NoStore);
        Assert.Contains("LEGAL_NOT_READY", await refused.Content.ReadAsStringAsync());
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        Assert.Equal(1, await db.ContactSharingAcceptances.CountAsync(x => x.MoveRequestId == request.Id));
        Assert.Equal(request.PublishedAt, (await db.MoveRequests.FindAsync(request.Id))!.PublishedAt);
    }

    [Theory]
    [InlineData(false, 60)]
    [InlineData(true, 10)]
    public async Task PublicationBudgetsAreIndependentPerAccountAndReturnRetryableNoStore429(bool write, int limit)
    {
        var request = await Seed();
        using var owner = await Session(request.CustomerUserId);
        await Csrf(owner);
        var before = await State(request.Id);
        async Task<HttpResponseMessage> Send(HttpClient client, MoveRequest row, bool mutation)
            => mutation ? await client.PostAsJsonAsync(RenewPath(row.Id), Payload(row)) : await client.GetAsync(StatusPath(row.Id));
        for (var i = 0; i < limit; i++)
        {
            using var allowed = await Send(owner, request, write);
            Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
        }
        using var blocked = await Send(owner, request, write);
        Assert.Equal(HttpStatusCode.TooManyRequests, blocked.StatusCode);
        Assert.Contains("RATE_LIMITED", await blocked.Content.ReadAsStringAsync());
        Assert.NotNull(blocked.Headers.RetryAfter);
        Assert.True(blocked.Headers.CacheControl?.NoStore);
        // Filling the read bucket cannot block consent writes, or vice versa.
        using var independentOperation = await Send(owner, request, !write);
        Assert.Equal(HttpStatusCode.OK, independentOperation.StatusCode);
        Assert.Equal(before, await State(request.Id)); // Every write above was a valid idempotent repeat.
        var otherRequest = await Seed();
        using var other = await Session(otherRequest.CustomerUserId);
        await Csrf(other);
        using var otherAccount = await Send(other, otherRequest, write);
        Assert.Equal(HttpStatusCode.OK, otherAccount.StatusCode);
    }

    private async Task<MoveRequest> Seed(WebApplicationFactory<Program>? app = null)
    {
        using var scope = (app ?? _factory).Services.CreateScope();
        return await MarketplaceTestData.SeedAsync(scope.ServiceProvider.GetRequiredService<MovelyDbContext>());
    }
    private async Task<HttpClient> NewAccount(UserRole role)
    {
        using var scope = _factory.Services.CreateScope();
        var user = await BusinessTestData.User(scope.ServiceProvider.GetRequiredService<MovelyDbContext>(), role);
        return await Session(user.Id);
    }
    private async Task<HttpClient> Viewer()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        var user = await BusinessTestData.User(db, UserRole.Mover);
        db.Businesses.Add(new Business { Id = Guid.NewGuid(), OwnerUserId = user.Id, Status = BusinessStatus.Verified, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();
        return await Session(user.Id);
    }
    private async Task<HttpClient> Session(Guid userId, WebApplicationFactory<Program>? app = null)
    {
        var host = app ?? _factory;
        using var scope = host.Services.CreateScope();
        var token = await scope.ServiceProvider.GetRequiredService<ISessionService>().CreateSessionAsync(userId);
        var client = host.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false, AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add("Cookie", $"movely.session={token}");
        return client;
    }
    private static async Task Csrf(HttpClient client)
    {
        using var response = await client.GetAsync("/api/v1/auth/csrf");
        response.EnsureSuccessStatusCode();
        var cookie = response.Headers.GetValues("Set-Cookie").Select(x => x.Split(';')[0]).Single(x => x.StartsWith("movely.csrf=", StringComparison.Ordinal));
        var session = client.DefaultRequestHeaders.GetValues("Cookie").Single();
        client.DefaultRequestHeaders.Remove("Cookie");
        client.DefaultRequestHeaders.Add("Cookie", session + "; " + cookie);
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", (await response.Content.ReadFromJsonAsync<CsrfReply>())!.RequestToken);
    }
    private async Task Mutate(Action<MovelyDbContext> mutate)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        mutate(db); await db.SaveChangesAsync();
    }
    private async Task<Dictionary<Guid, string>> ConsentRows(Guid id)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        return (await db.ContactSharingAcceptances.AsNoTracking().Where(x => x.MoveRequestId == id).ToListAsync())
            .ToDictionary(x => x.Id, x => JsonSerializer.Serialize(x, ApiJson.Options));
    }
    private async Task<string> State(Guid id)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        return JsonSerializer.Serialize(new {
            Request = await db.MoveRequests.AsNoTracking().Where(x => x.Id == id).Select(x => new {
                x.Id, x.CustomerUserId, x.Status, x.LeadSalesStatus, x.CurrentVersionId, x.MaxLeadBuyers, x.ActiveBuyerCount,
                x.UpdatedAt, x.PublishedAt, x.ClosedAt, x.CancelledAt, x.ExpiredAt
            }).SingleAsync(),
            Versions = await db.MoveRequestVersions.AsNoTracking().Where(x => x.MoveRequestId == id).OrderBy(x => x.Id).Select(x => new { x.Id, x.VersionNumber, x.CreatedAt }).ToListAsync(),
            Policies = await db.PolicyAcceptances.AsNoTracking().Where(x => db.MoveRequests.Any(r => r.Id == id && r.CustomerUserId == x.UserId))
                .OrderBy(x => x.Id).Select(x => new { x.Id, x.UserId, x.TermsVersion, x.PrivacyVersion, x.IsTestOnly, x.AdultConfirmed, x.AcceptedAt }).ToListAsync(),
            Consents = (await ConsentRows(id)).OrderBy(x => x.Key).ToArray()
        }, ApiJson.Options);
    }
    private static async Task<JsonDocument> Status(HttpClient client, Guid id)
    {
        using var response = await client.GetAsync(StatusPath(id));
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync());
    }
    private static object Payload(MoveRequest request, int? max = null) => new {
        expectedCurrentVersionId = request.CurrentVersionId,
        contactSharing = new { shareContacts = true, disclosureVersion = ConsentPolicy.Version, maxRecipients = max ?? request.MaxLeadBuyers }
    };
    private static string StatusPath(Guid id) => $"/api/v1/move-requests/{id}/publication-status";
    private static string RenewPath(Guid id) => $"/api/v1/move-requests/{id}/contact-sharing";
    private static string MarketPath(Guid id) => $"/api/v1/marketplace/requests/{id}";
    private sealed record CsrfReply(string RequestToken);
}
