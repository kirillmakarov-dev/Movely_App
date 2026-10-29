using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Movely.Api.Data;
using Movely.Api.Modules.Businesses;
using Movely.Api.Modules.Identity;

namespace Movely.Api.Tests;

public sealed class BusinessEndpointsTests : IDisposable
{
    private readonly ApiFactory _factory = new();
    public void Dispose() => _factory.Dispose();

    [Fact]
    public async Task OwnerRoutesRequireSessionAndIgnorePrivilegeFieldsInSubmittedJson()
    {
        using var anonymous = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/v1/businesses/me")).StatusCode);
        var (owner, userId) = await Login();
        using var ownerClient = owner;
        using var created = await owner.PostAsJsonAsync("/api/v1/businesses", new {
            name = "Movers", registrationNumber = "123456789", registeredAddress = "Private registered address", representativeName = "Owner Name",
            serviceAreaCodes = new[] { "5000" }, authorizedRepresentative = true, status = "Verified", role = "Admin", ownerUserId = Guid.NewGuid(),
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.True(created.Headers.CacheControl?.NoStore);
        var profile = (await created.Content.ReadFromJsonAsync<BusinessProfileDto>(ApiJson.Options))!;
        Assert.Equal(BusinessStatus.PendingVerification, profile.Status);
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        Assert.Equal(userId, (await db.Businesses.FindAsync(profile.Id))!.OwnerUserId);
        Assert.Equal(UserRole.Customer, (await db.Users.FindAsync(userId))!.Role);
        var (other, _) = await Login();
        using var otherClient = other;
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync("/api/v1/businesses/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.GetAsync("/api/v1/admin/businesses")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.PostAsJsonAsync($"/api/v1/admin/businesses/{profile.Id}/reviews", BusinessTestData.Review(profile.RevisionId), ApiJson.Options)).StatusCode);
        using var fetched = await owner.GetAsync("/api/v1/businesses/me");
        Assert.True(fetched.Headers.CacheControl?.NoStore);
    }

    [Fact]
    public async Task AdminReviewHasPrivateNotesButOwnerResponseDoesNotLeakThemOrSnapshot()
    {
        var (owner, _) = await Login();
        using var ownerClient = owner;
        using var created = await owner.PostAsJsonAsync("/api/v1/businesses", BusinessTestData.Profile, ApiJson.Options);
        var profile = (await created.Content.ReadFromJsonAsync<BusinessProfileDto>(ApiJson.Options))!;
        var (admin, adminId) = await Login(UserRole.Admin);
        using var adminClient = admin;
        using var reviewed = await admin.PostAsJsonAsync($"/api/v1/admin/businesses/{profile.Id}/reviews", BusinessTestData.Review(profile.RevisionId), ApiJson.Options);
        reviewed.EnsureSuccessStatusCode();
        Assert.True(reviewed.Headers.CacheControl?.NoStore);
        var adminJson = await reviewed.Content.ReadAsStringAsync();
        Assert.Contains("Registry and representative checked manually", adminJson);
        Assert.Contains(adminId.ToString(), adminJson);
        Assert.DoesNotContain("profileSnapshotJson", adminJson);
        var ownerJson = await owner.GetStringAsync("/api/v1/businesses/me");
        Assert.DoesNotContain("internalNotes", ownerJson);
        Assert.DoesNotContain("reviewedByUserId", ownerJson);
        Assert.DoesNotContain(adminId.ToString(), ownerJson);
        Assert.DoesNotContain("profileRevisionId", ownerJson);
        Assert.Contains("Owner-visible reason", ownerJson);
        using var parsed = JsonDocument.Parse(ownerJson);
        Assert.Equal(new[] { "createdAt", "id", "latestReview", "name", "registeredAddress", "registrationNumber", "representativeConfirmedAt", "representativeName", "revisionId", "serviceAreas", "status", "updatedAt" }, parsed.RootElement.EnumerateObject().Select(x => x.Name).Order());
        Assert.Equal(new[] { "ownerMessage", "reviewedAt", "status" }, parsed.RootElement.GetProperty("latestReview").EnumerateObject().Select(x => x.Name).Order());
        var verified = JsonSerializer.Deserialize<BusinessProfileDto>(ownerJson, ApiJson.Options)!;
        using var updated = await owner.PatchAsJsonAsync("/api/v1/businesses/me", BusinessTestData.Update(verified, true), ApiJson.Options);
        updated.EnsureSuccessStatusCode();
        Assert.Equal(BusinessStatus.PendingVerification, (await updated.Content.ReadFromJsonAsync<BusinessProfileDto>(ApiJson.Options))!.Status);
        using var stale = await admin.PostAsJsonAsync($"/api/v1/admin/businesses/{profile.Id}/reviews", BusinessTestData.Review(verified.RevisionId), ApiJson.Options);
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Contains("BUSINESS_REVISION_CONFLICT", await stale.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task LegalGateReturnsHttp503WithNoStore()
    {
        var gate = new SwitchableLegalGate();
        using var app = _factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services => services.AddSingleton<IConsentReleaseGate>(gate)));
        var (owner, userId) = await Login(app: app);
        gate.Blocked = true;
        using var ownerClient = owner;
        using var response = await owner.PostAsJsonAsync("/api/v1/businesses", BusinessTestData.Profile, ApiJson.Options);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("LEGAL_NOT_READY", await response.Content.ReadAsStringAsync());
        Assert.True(response.Headers.CacheControl?.NoStore);
        using var scope = app.Services.CreateScope();
        Assert.False(await scope.ServiceProvider.GetRequiredService<MovelyDbContext>().Businesses.AnyAsync(x => x.OwnerUserId == userId));
    }

    [Theory]
    [InlineData("?status=invalid")]
    [InlineData("?status=1")]
    [InlineData("?status=Verified&status=Rejected")]
    [InlineData("?page=0")]
    [InlineData("?pageSize=51")]
    [InlineData("?page=-1")]
    [InlineData("?page=2147483647&pageSize=50")]
    public async Task InvalidAdminFiltersReturn400(string query)
    {
        var (admin, _) = await Login(UserRole.Admin);
        using var client = admin;
        using var response = await admin.GetAsync("/api/v1/admin/businesses" + query);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("INVALID_BUSINESS_FILTER", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task AdminListFiltersAndPaginatesWithoutExposingProfileOrOwnerContact()
    {
        using (var scope = _factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            for (var i = 0; i < 3; i++) {
                var user = await BusinessTestData.User(db);
                var profile = await BusinessTestData.Service(db).CreateAsync(user.Id, BusinessTestData.Profile);
                var row = (await db.Businesses.FindAsync(profile.Id))!;
                row.UpdatedAt = DateTimeOffset.UtcNow.AddMinutes(i);
                if (i == 2) row.Status = BusinessStatus.Rejected;
            }
            await db.SaveChangesAsync();
        }
        var (admin, _) = await Login(UserRole.Admin);
        using var client = admin;
        var first = (await admin.GetFromJsonAsync<AdminBusinessPageDto>("/api/v1/admin/businesses?status=PendingVerification&pageSize=1", ApiJson.Options))!;
        var second = (await admin.GetFromJsonAsync<AdminBusinessPageDto>("/api/v1/admin/businesses?status=PendingVerification&pageSize=1&page=2", ApiJson.Options))!;
        Assert.Equal(2, first.TotalCount);
        Assert.NotEqual(Assert.Single(first.Items).Id, Assert.Single(second.Items).Id);
        Assert.True(first.Items[0].UpdatedAt > second.Items[0].UpdatedAt);
        var json = await admin.GetStringAsync("/api/v1/admin/businesses");
        Assert.DoesNotContain("registeredAddress", json);
        Assert.DoesNotContain("registrationNumber", json);
        Assert.DoesNotContain("phone", json);
        Assert.DoesNotContain("owner", json);
    }

    [Theory]
    [InlineData(false, 10)]
    [InlineData(true, 30)]
    public async Task WriteLimitsArePerAuthenticatedAccount(bool adminRoute, int limit)
    {
        var role = adminRoute ? UserRole.Admin : UserRole.Customer;
        var (first, _) = await Login(role);
        using var firstClient = first;
        var path = adminRoute ? $"/api/v1/admin/businesses/{Guid.NewGuid()}/reviews" : "/api/v1/businesses";
        object payload = adminRoute ? BusinessTestData.Review(Guid.NewGuid()) : BusinessTestData.Profile with { AuthorizedRepresentative = false };
        for (var i = 0; i < limit; i++) {
            using var allowed = await first.PostAsJsonAsync(path, payload, ApiJson.Options);
            Assert.NotEqual(HttpStatusCode.TooManyRequests, allowed.StatusCode);
        }
        using var blocked = await first.PostAsJsonAsync(path, payload, ApiJson.Options);
        Assert.Equal(HttpStatusCode.TooManyRequests, blocked.StatusCode);
        Assert.Contains("RATE_LIMITED", await blocked.Content.ReadAsStringAsync());
        Assert.NotNull(blocked.Headers.RetryAfter);
        Assert.True(blocked.Headers.CacheControl?.NoStore);
        var (second, _) = await Login(role);
        using var secondClient = second;
        Assert.NotEqual(HttpStatusCode.TooManyRequests, (await second.PostAsJsonAsync(path, payload, ApiJson.Options)).StatusCode);
    }

    [Fact]
    public async Task MissingDecisionCannotDefaultToVerification()
    {
        var (owner, _) = await Login();
        using var ownerClient = owner;
        using var created = await owner.PostAsJsonAsync("/api/v1/businesses", BusinessTestData.Profile, ApiJson.Options);
        var profile = (await created.Content.ReadFromJsonAsync<BusinessProfileDto>(ApiJson.Options))!;
        var (admin, _) = await Login(UserRole.Admin);
        using var adminClient = admin;
        using var response = await admin.PostAsJsonAsync($"/api/v1/admin/businesses/{profile.Id}/reviews", new {
            expectedRevisionId = profile.RevisionId, registryChecked = true, representativeChecked = true,
            internalNotes = "Checks completed but no decision supplied", ownerMessage = "Review message",
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("INVALID_BUSINESS_REVIEW", await response.Content.ReadAsStringAsync());
        var unchanged = (await owner.GetFromJsonAsync<BusinessProfileDto>("/api/v1/businesses/me", ApiJson.Options))!;
        Assert.Equal(profile.RevisionId, unchanged.RevisionId);
        Assert.Equal(BusinessStatus.PendingVerification, unchanged.Status);
    }

    [Theory]
    [InlineData("phone", "PHONE_NOT_VERIFIED")]
    [InlineData("policy", "POLICY_ACCEPTANCE_REQUIRED")]
    [InlineData("admin", "BUSINESS_OWNER_ROLE_REQUIRED")]
    public async Task SubmissionGuardsReturnExplicitHttp403(string missing, string code)
    {
        var (client, userId) = await Login(missing == "admin" ? UserRole.Admin : UserRole.Customer);
        using var owner = client;
        using (var scope = _factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            if (missing == "phone") (await db.Users.FindAsync(userId))!.PhoneVerified = false;
            if (missing == "policy") db.PolicyAcceptances.RemoveRange(db.PolicyAcceptances.Where(x => x.UserId == userId));
            await db.SaveChangesAsync();
        }
        using var response = await client.PostAsJsonAsync("/api/v1/businesses", BusinessTestData.Profile, ApiJson.Options);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Contains(code, await response.Content.ReadAsStringAsync());
        Assert.True(response.Headers.CacheControl?.NoStore);
    }

    [Fact]
    public async Task ReadLimitIsPerAuthenticatedAccountAndDoesNotConsumeWriteBudget()
    {
        var (first, _) = await Login();
        using var firstClient = first;
        for (var i = 0; i < 60; i++) {
            using var response = await first.GetAsync("/api/v1/businesses/me");
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }
        using var blocked = await first.GetAsync("/api/v1/businesses/me");
        Assert.Equal(HttpStatusCode.TooManyRequests, blocked.StatusCode);
        Assert.True(blocked.Headers.CacheControl?.NoStore);
        using var write = await first.PostAsJsonAsync("/api/v1/businesses", BusinessTestData.Profile, ApiJson.Options);
        Assert.Equal(HttpStatusCode.Created, write.StatusCode);
        var (second, _) = await Login();
        using var secondClient = second;
        Assert.Equal(HttpStatusCode.NotFound, (await second.GetAsync("/api/v1/businesses/me")).StatusCode);
    }

    private async Task<(HttpClient Client, Guid UserId)> Login(UserRole role = UserRole.Customer, WebApplicationFactory<Program>? app = null)
    {
        var host = app ?? _factory;
        var client = host.CreateClient();
        var csrf = (await client.GetFromJsonAsync<CsrfReply>("/api/v1/auth/csrf"))!;
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf.RequestToken);
        var key = Guid.NewGuid().ToString("N");
        using var login = await client.PostAsJsonAsync("/api/v1/auth/google/sign-in", new GoogleSignInRequest($"dev-google:{key}:{key}@example.com:Test:Owner", ConsentFixtures.Acceptance));
        login.EnsureSuccessStatusCode();
        var user = (await login.Content.ReadFromJsonAsync<CurrentUserDto>(ApiJson.Options))!;
        using (var scope = host.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            var row = (await db.Users.FindAsync(user.Id))!;
            row.Role = role;
            row.Phone = "+972501234567";
            row.PhoneVerified = true;
            await db.SaveChangesAsync();
        }
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        csrf = (await client.GetFromJsonAsync<CsrfReply>("/api/v1/auth/csrf"))!;
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf.RequestToken);
        return (client, user.Id);
    }
    private sealed record CsrfReply(string RequestToken);
    private sealed class SwitchableLegalGate : IConsentReleaseGate
    {
        public bool Blocked { get; set; }
        public void EnsureAvailable() { if (Blocked) new BusinessTestData.BlockLegal().EnsureAvailable(); }
    }
}
