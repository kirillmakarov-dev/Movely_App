using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Modules.Identity;
using Movely.Api.Modules.MoveRequests;
using Movely.Api.Shared.Authorization;

namespace Movely.Api.Tests;

[Trait("Category", "Integration")]
public sealed class SessionBusinessCapabilityTests : IDisposable
{
    private readonly ApiFactory _factory = new();
    public void Dispose() => _factory.Dispose();

    [Fact]
    public async Task AuthenticatedCsrfSurvivesBusinessAndPhoneClaimChangesWithoutRefresh()
    {
        using var owner = await Session();
        await IssueCsrf(owner); // Before any business exists; never refresh this token below.
        await AddBusiness(owner.Id, BusinessStatus.PendingVerification);
        await CreateDraft(owner.Client);
        foreach (var status in new[] { BusinessStatus.Verified, BusinessStatus.Suspended, BusinessStatus.Rejected })
        {
            await Mutate(async db => {
                (await db.Businesses.SingleAsync(x => x.OwnerUserId == owner.Id)).Status = status;
                var user = (await db.Users.FindAsync(owner.Id))!;
                user.Phone = "+972541234567";
                user.PhoneVerified = !user.PhoneVerified;
            });
            await CreateDraft(owner.Client);
        }
        var me = await Me(owner.Client);
        Assert.Equal(UserRole.Customer, me.Role);
        Assert.Equal(BusinessStatus.Rejected, me.BusinessStatus);
        using var scope = _factory.Services.CreateScope();
        Assert.Equal(4, await scope.ServiceProvider.GetRequiredService<MovelyDbContext>().MoveRequests.CountAsync(x => x.CustomerUserId == owner.Id));
    }

    [Fact]
    public async Task CsrfTokenCannotCrossUsersEvenWithTheExactSameAntiforgeryCookie()
    {
        using var alice = await Session();
        using var bob = await Session();
        var aliceCsrf = await IssueCsrf(alice);
        await CreateDraft(alice.Client); // Establish that the token/cookie pair itself is valid.
        SetCookie(bob, aliceCsrf.Cookie);
        SetToken(bob.Client, aliceCsrf.Token);
        using var rejected = await bob.Client.PostAsJsonAsync("/api/v1/move-requests", new { requestType = "SmallMove" });
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        Assert.Contains("INVALID_CSRF_TOKEN", await rejected.Content.ReadAsStringAsync());
        var bobCsrf = await IssueCsrf(bob, aliceCsrf.Cookie);
        Assert.Equal(aliceCsrf.Cookie, bobCsrf.Cookie); // Only the authenticated identity/request token changed.
        await CreateDraft(bob.Client);
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        Assert.Equal(1, await db.MoveRequests.CountAsync(x => x.CustomerUserId == alice.Id));
        Assert.Equal(1, await db.MoveRequests.CountAsync(x => x.CustomerUserId == bob.Id));
    }

    [Fact]
    public async Task VerifiedCustomerBusinessAddsMarketplaceWithoutLosingCustomerOwnershipOrPublication()
    {
        using var owner = await Session();
        await IssueCsrf(owner);
        var earlier = await CreateDraft(owner.Client);
        await AddBusiness(owner.Id, BusinessStatus.Verified);
        using var market = await owner.Client.GetAsync("/api/v1/marketplace/requests");
        Assert.Equal(HttpStatusCode.OK, market.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await owner.Client.GetAsync($"/api/v1/move-requests/{earlier.Id}")).StatusCode);
        var draft = await CreateDraft(owner.Client);
        using var update = await owner.Client.PutAsJsonAsync($"/api/v1/move-requests/{draft.Id}", ActiveRequestTestData.Update(), ApiJson.Options);
        update.EnsureSuccessStatusCode();
        using var publish = await owner.Client.PostAsJsonAsync($"/api/v1/move-requests/{draft.Id}/publish", ConsentFixtures.Sharing);
        publish.EnsureSuccessStatusCode();
        var published = (await publish.Content.ReadFromJsonAsync<PublishMoveRequestResponse>(ApiJson.Options))!;
        Assert.Equal(MoveRequestStatus.Active, published.MoveRequest.Status);
        Assert.Equal(owner.Id, published.MoveRequest.CustomerUserId);
        Assert.Equal(UserRole.Customer, (await Me(owner.Client)).Role);
        using var scope = _factory.Services.CreateScope();
        Assert.Equal(UserRole.Customer, (await scope.ServiceProvider.GetRequiredService<MovelyDbContext>().Users.FindAsync(owner.Id))!.Role);
    }

    [Fact]
    public async Task CustomerWithoutBusinessCannotAcquireMarketplaceWithForgedFrontendHeaders()
    {
        using var owner = await Session();
        owner.Client.DefaultRequestHeaders.Add("X-Frontend-Role", "Mover");
        owner.Client.DefaultRequestHeaders.Add("X-Business-Status", "Verified");
        owner.Client.DefaultRequestHeaders.Add("X-Business-Id", Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.Client.GetAsync("/api/v1/marketplace/requests")).StatusCode);
        var me = await Me(owner.Client);
        Assert.Equal(UserRole.Customer, me.Role);
        Assert.Null(me.BusinessId);
    }

    [Fact]
    public async Task LegacyMoverCanRequestAndVerifyOtpWithoutAcquiringCustomerRole()
    {
        using var mover = await Session(UserRole.Mover, phoneVerified: false);
        await IssueCsrf(mover);
        await VerifyNewPhone(mover.Client, "0541234567");
        var me = await Me(mover.Client);
        Assert.Equal(UserRole.Mover, me.Role);
        Assert.True(me.PhoneVerified);
        Assert.Equal("+972541234567", me.Phone);
        Assert.Equal(HttpStatusCode.Forbidden, (await mover.Client.PostAsJsonAsync("/api/v1/move-requests", new { requestType = "SmallMove" })).StatusCode);
    }

    [Fact]
    public async Task AdminWithVerifiedBusinessDoesNotGainMoverOrOtpAccess()
    {
        using var admin = await Session(UserRole.Admin);
        await AddBusiness(admin.Id, BusinessStatus.Verified);
        await IssueCsrf(admin);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.Client.GetAsync("/api/v1/marketplace/requests")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.Client.PostAsJsonAsync("/api/v1/auth/phone/request-code", new PhoneRequestCodeRequest("0541234567"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.Client.PostAsJsonAsync("/api/v1/auth/phone/verify-code", new PhoneVerifyCodeRequest("0541234567", "123456"))).StatusCode);
        Assert.Equal(UserRole.Admin, (await Me(admin.Client)).Role);
        using var scope = _factory.Services.CreateScope();
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<MovelyDbContext>().PhoneVerifications.ToListAsync());
    }

    [Fact]
    public async Task ChangingVerifiedBusinessOwnersPhoneBlocksMarketplaceUntilOtpCompletes()
    {
        using var owner = await Session();
        await AddBusiness(owner.Id, BusinessStatus.Verified);
        await IssueCsrf(owner);
        Assert.Equal(HttpStatusCode.OK, (await owner.Client.GetAsync("/api/v1/marketplace/requests")).StatusCode);
        using var requested = await owner.Client.PostAsJsonAsync("/api/v1/auth/phone/request-code", new PhoneRequestCodeRequest("0541234567"));
        requested.EnsureSuccessStatusCode();
        var otp = (await requested.Content.ReadFromJsonAsync<RequestPhoneCodeResponse>())!;
        Assert.False((await Me(owner.Client)).PhoneVerified);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.Client.GetAsync("/api/v1/marketplace/requests")).StatusCode);
        using var verified = await owner.Client.PostAsJsonAsync("/api/v1/auth/phone/verify-code", new PhoneVerifyCodeRequest("0541234567", otp.DebugCode!));
        verified.EnsureSuccessStatusCode(); // Reuse the token issued before the phone changed.
        Assert.Equal(HttpStatusCode.OK, (await owner.Client.GetAsync("/api/v1/marketplace/requests")).StatusCode);
        Assert.Equal(BusinessStatus.Verified, (await Me(owner.Client)).BusinessStatus);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task BothVerifiedBusinessPoliciesRequireCurrentVerifiedPhone(bool phoneVerified)
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity([
            new(ClaimTypes.Role, "Mover"), new("business_status", "Verified"),
            new("subscription_status", "Active"), new("phone_verified", phoneVerified.ToString())
        ], "test"));
        using var scope = _factory.Services.CreateScope();
        var authorization = scope.ServiceProvider.GetRequiredService<IAuthorizationService>();
        foreach (var policy in new[] { AuthorizationExtensions.VerifiedMover, AuthorizationExtensions.PremiumVerifiedMover })
            Assert.Equal(phoneVerified, (await authorization.AuthorizeAsync(principal, null, policy)).Succeeded);
    }

    [Fact]
    public void CurrentUserUsesExplicitPrimaryRoleEvenWhenSecondaryRoleComesFirst()
    {
        var accessor = new HttpContextAccessor { HttpContext = new DefaultHttpContext {
            User = new ClaimsPrincipal(new ClaimsIdentity([
                new(ClaimTypes.Role, "Mover"), new(ClaimTypes.Role, "Customer"), new("movely_primary_role", "Customer")
            ], "test"))
        }};
        Assert.Equal(UserRole.Customer, new CurrentUser(accessor).Role);
        accessor.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, "Mover")], "legacy"));
        Assert.Equal(UserRole.Mover, new CurrentUser(accessor).Role);
    }

    private async Task<SessionClient> Session(UserRole role = UserRole.Customer, bool phoneVerified = true)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        var user = new MovelyUser { Id = Guid.NewGuid(), Role = role, Status = UserStatus.Active,
            FirstName = "Session", LastName = "Test", Phone = "+972501234567", PhoneVerified = phoneVerified,
            CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
        db.Users.Add(user);
        ConsentPolicy.Add(db, user.Id, DateTimeOffset.UtcNow);
        await db.SaveChangesAsync();
        var token = await scope.ServiceProvider.GetRequiredService<ISessionService>().CreateSessionAsync(user.Id);
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false, AllowAutoRedirect = false });
        var result = new SessionClient(user.Id, client, $"movely.session={token}");
        SetCookie(result, null);
        return result;
    }

    private async Task AddBusiness(Guid ownerId, BusinessStatus status) => await Mutate(db => {
        db.Businesses.Add(new Business { Id = Guid.NewGuid(), OwnerUserId = ownerId, Name = "Test business", Status = status,
            CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        return Task.CompletedTask;
    });

    private async Task Mutate(Func<MovelyDbContext, Task> change)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        await change(db);
        await db.SaveChangesAsync();
    }

    private static async Task<CurrentUserDto> Me(HttpClient client)
        => (await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me", ApiJson.Options))!;

    private static async Task<MoveRequestResponse> CreateDraft(HttpClient client)
    {
        using var response = await client.PostAsJsonAsync("/api/v1/move-requests", new { requestType = "SmallMove" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<MoveRequestResponse>(ApiJson.Options))!;
    }

    private static async Task VerifyNewPhone(HttpClient client, string phone)
    {
        using var request = await client.PostAsJsonAsync("/api/v1/auth/phone/request-code", new PhoneRequestCodeRequest(phone));
        request.EnsureSuccessStatusCode();
        var otp = (await request.Content.ReadFromJsonAsync<RequestPhoneCodeResponse>())!;
        Assert.False(string.IsNullOrWhiteSpace(otp.DebugCode));
        using var verify = await client.PostAsJsonAsync("/api/v1/auth/phone/verify-code", new PhoneVerifyCodeRequest(phone, otp.DebugCode!));
        verify.EnsureSuccessStatusCode();
    }

    private static async Task<(string Token, string Cookie)> IssueCsrf(SessionClient session, string? existingCookie = null)
    {
        using var response = await session.Client.GetAsync("/api/v1/auth/csrf");
        response.EnsureSuccessStatusCode();
        var cookie = response.Headers.TryGetValues("Set-Cookie", out var values)
            ? values.Select(value => value.Split(';')[0]).FirstOrDefault(value => value.StartsWith("movely.csrf=", StringComparison.Ordinal)) ?? existingCookie
            : existingCookie;
        Assert.NotNull(cookie);
        var token = (await response.Content.ReadFromJsonAsync<CsrfResponse>())!.RequestToken;
        SetCookie(session, cookie);
        SetToken(session.Client, token);
        return (token, cookie);
    }

    private static void SetCookie(SessionClient session, string? antiforgeryCookie)
    {
        session.Client.DefaultRequestHeaders.Remove("Cookie");
        session.Client.DefaultRequestHeaders.Add("Cookie", session.SessionCookie + (antiforgeryCookie is null ? "" : "; " + antiforgeryCookie));
    }

    private static void SetToken(HttpClient client, string token)
    {
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", token);
    }

    private sealed record CsrfResponse(string RequestToken);
    private sealed record SessionClient(Guid Id, HttpClient Client, string SessionCookie) : IDisposable
    {
        public void Dispose() => Client.Dispose();
    }
}
