using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Modules.Identity;
using Movely.Api.Shared.Authorization;

namespace Movely.Api.Tests;

[Trait("Category", "Integration")]
[Trait("Category", "SecurityRegression")]
public sealed class AuthFoundationTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public AuthFoundationTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GoogleSignIn_CreatesSessionAndReturnsCurrentUser()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            HandleCookies = true,
            AllowAutoRedirect = false
        });

        await IssueCsrfTokenAsync(client);

        var response = await client.PostAsJsonAsync("/api/v1/auth/google/sign-in", new GoogleSignInRequest("dev-google:subject-1:alice@example.com:Alice:Mover"));

        response.EnsureSuccessStatusCode();

        var user = await response.Content.ReadFromJsonAsync<CurrentUserDto>();
        Assert.NotNull(user);
        Assert.Equal("Alice", user!.FirstName);
        Assert.Equal("alice@example.com", user.Email);
        Assert.Equal(UserRole.Customer, user.Role);

        var me = await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
        Assert.NotNull(me);
        Assert.Equal(user.Id, me!.Id);
    }

    [Fact]
    public async Task PhoneVerification_RoundsTripAndMarksPhoneVerified()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            HandleCookies = true,
            AllowAutoRedirect = false
        });

        await IssueCsrfTokenAsync(client);
        await SignInAsync(client, "subject-phone", "phone@example.com", "Pia", "Customer");

        await IssueCsrfTokenAsync(client);
        var requestResponse = await client.PostAsJsonAsync("/api/v1/auth/phone/request-code", new PhoneRequestCodeRequest("050-123-4567"));
        requestResponse.EnsureSuccessStatusCode();

        var requestCode = await requestResponse.Content.ReadFromJsonAsync<RequestPhoneCodeResponse>();
        Assert.NotNull(requestCode);
        Assert.False(string.IsNullOrWhiteSpace(requestCode!.DebugCode));

        await IssueCsrfTokenAsync(client);
        var verifyResponse = await client.PostAsJsonAsync(
            "/api/v1/auth/phone/verify-code",
            new PhoneVerifyCodeRequest("050-123-4567", requestCode.DebugCode!));

        verifyResponse.EnsureSuccessStatusCode();

        var currentUser = await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
        Assert.NotNull(currentUser);
        Assert.True(currentUser!.PhoneVerified);
        Assert.Equal("+972501234567", currentUser.Phone);
    }

    [Fact]
    public async Task Logout_RevokesSessionAndBlocksMe()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            HandleCookies = true,
            AllowAutoRedirect = false
        });

        await IssueCsrfTokenAsync(client);
        await SignInAsync(client, "subject-logout", "logout@example.com", "Lia", "Customer");

        await IssueCsrfTokenAsync(client);
        var logout = await client.PostAsync("/api/v1/auth/logout", content: null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);

        var me = await client.GetAsync("/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }

    [Fact]
    public async Task DuplicateGoogleSubject_UsesSingleUserAndIdentity()
    {
        using var baselineScope = _factory.Services.CreateScope();
        var baselineDb = baselineScope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        var usersBefore = await baselineDb.Users.CountAsync();
        var identitiesBefore = await baselineDb.UserAuthIdentities.CountAsync();

        var firstClient = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            HandleCookies = true,
            AllowAutoRedirect = false
        });

        await IssueCsrfTokenAsync(firstClient);
        await SignInAsync(firstClient, "subject-dup", "dup@example.com", "Dora", "One");
        var firstMe = await firstClient.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
        Assert.NotNull(firstMe);

        var secondClient = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            HandleCookies = true,
            AllowAutoRedirect = false
        });

        await IssueCsrfTokenAsync(secondClient);
        await SignInAsync(secondClient, "subject-dup", "dup@example.com", "Different", "Name");
        var secondMe = await secondClient.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
        Assert.NotNull(secondMe);

        Assert.Equal(firstMe!.Id, secondMe!.Id);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        Assert.Equal(usersBefore + 1, await db.Users.CountAsync());
        Assert.Equal(identitiesBefore + 1, await db.UserAuthIdentities.CountAsync());
    }

    [Fact]
    public async Task AuthorizationPolicies_AllowExpectedClaims()
    {
        using var scope = _factory.Services.CreateScope();
        var authorization = scope.ServiceProvider.GetRequiredService<IAuthorizationService>();

        var verifiedCustomer = BuildPrincipal(
            UserRole.Customer,
            phoneVerified: true);

        var mover = BuildPrincipal(
            UserRole.Mover,
            phoneVerified: false,
            businessStatus: BusinessStatus.Verified,
            subscriptionStatus: SubscriptionStatus.Active);

        Assert.True((await authorization.AuthorizeAsync(verifiedCustomer, null, AuthorizationExtensions.VerifiedPhoneCustomer)).Succeeded);
        Assert.True((await authorization.AuthorizeAsync(mover, null, AuthorizationExtensions.PremiumVerifiedMover)).Succeeded);
    }

    private static ClaimsPrincipal BuildPrincipal(
        UserRole role,
        bool phoneVerified,
        BusinessStatus? businessStatus = null,
        SubscriptionStatus? subscriptionStatus = null)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()),
            new(ClaimTypes.Role, role.ToString()),
            new("phone_verified", phoneVerified.ToString()),
            new(ClaimTypes.GivenName, "Test"),
            new(ClaimTypes.Surname, "User")
        };

        if (businessStatus is not null)
        {
            claims.Add(new Claim("business_status", businessStatus.Value.ToString()));
        }

        if (subscriptionStatus is not null)
        {
            claims.Add(new Claim("subscription_status", subscriptionStatus.Value.ToString()));
        }

        var identity = new ClaimsIdentity(claims, "Test", ClaimTypes.Name, ClaimTypes.Role);
        return new ClaimsPrincipal(identity);
    }

    private static async Task IssueCsrfTokenAsync(HttpClient client)
    {
        var csrf = await client.GetFromJsonAsync<CsrfResponse>("/api/v1/auth/csrf");
        Assert.NotNull(csrf);
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf!.RequestToken);
    }

    private static async Task SignInAsync(HttpClient client, string subject, string email, string firstName, string lastName)
    {
        var response = await client.PostAsJsonAsync(
            "/api/v1/auth/google/sign-in",
            new GoogleSignInRequest($"dev-google:{subject}:{email}:{firstName}:{lastName}"));

        response.EnsureSuccessStatusCode();
    }

    private sealed record CsrfResponse(string RequestToken);
}
