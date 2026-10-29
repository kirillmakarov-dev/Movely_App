using System.Net;
using System.Net.Http.Json;
using Google.Apis.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Movely.Api.Data;
using Movely.Api.Infrastructure.Authentication;
using Movely.Api.Modules.Identity;
using Movely.Api.Shared.Errors;

namespace Movely.Api.Tests;

public sealed class GoogleAuthenticationTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string ClientId = "123-release.apps.googleusercontent.com";

    [Theory]
    [InlineData("http://localhost:3000", true)]
    [InlineData("https://untrusted.example", false)]
    public async Task CredentialedCorsOnlyAllowsConfiguredWebOrigin(string origin, bool allowed)
    {
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Options, "/api/v1/auth/google/sign-in");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "content-type,x-csrf-token");
        var response = await client.SendAsync(request);
        if (allowed)
        {
            Assert.Equal(origin, Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
            Assert.Equal("true", Assert.Single(response.Headers.GetValues("Access-Control-Allow-Credentials")));
        }
        else
        {
            Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
            Assert.False(response.Headers.Contains("Access-Control-Allow-Credentials"));
        }
    }

    [Fact]
    public async Task ConfiguredGoogleFlowRequiresCsrfAndConsentBeforeIssuingSession()
    {
        var validator = new AcceptedValidator();
        using var configured = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Auth:Google:Mode"] = "Google", ["Auth:Google:ClientId"] = ClientId
            }));
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IGoogleTokenValidator>();
                services.AddSingleton<IGoogleTokenValidator>(validator);
            });
        });
        using var client = configured.CreateClient();
        var request = new GoogleSignInRequest("opaque-credential-from-google", ConsentFixtures.Acceptance);
        var missingCsrf = await client.PostAsJsonAsync("/api/v1/auth/google/sign-in", request);
        Assert.Equal(HttpStatusCode.BadRequest, missingCsrf.StatusCode);
        Assert.Equal(0, validator.Calls);
        var csrf = await client.GetFromJsonAsync<CsrfResponse>("/api/v1/auth/csrf");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf!.RequestToken);
        var missingConsent = await client.PostAsJsonAsync("/api/v1/auth/google/sign-in", request with { Acceptance = null });
        Assert.Equal(HttpStatusCode.BadRequest, missingConsent.StatusCode);
        using (var scope = configured.Services.CreateScope())
            Assert.False(await scope.ServiceProvider.GetRequiredService<MovelyDbContext>().UserAuthIdentities.AnyAsync(x => x.ProviderSubject == validator.Subject));
        var success = await client.PostAsJsonAsync("/api/v1/auth/google/sign-in", request);
        success.EnsureSuccessStatusCode();
        var created = (await success.Content.ReadFromJsonAsync<CurrentUserDto>(ApiJson.Options))!;
        Assert.True(created.HasCurrentPolicyAcceptance);
        Assert.Equal(created.Id, (await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me", ApiJson.Options))!.Id);
        var staleToken = await client.PostAsJsonAsync("/api/v1/auth/google/sign-in", request with { Acceptance = null });
        Assert.Equal(HttpStatusCode.BadRequest, staleToken.StatusCode);
        var signedInCsrf = await client.GetFromJsonAsync<CsrfResponse>("/api/v1/auth/csrf");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", signedInCsrf!.RequestToken);
        var returning = await client.PostAsJsonAsync("/api/v1/auth/google/sign-in", request with { Acceptance = null });
        returning.EnsureSuccessStatusCode();
        Assert.Equal(created.Id, (await returning.Content.ReadFromJsonAsync<CurrentUserDto>(ApiJson.Options))!.Id);
        using var check = configured.Services.CreateScope();
        var db = check.ServiceProvider.GetRequiredService<MovelyDbContext>();
        Assert.Equal(1, await db.UserAuthIdentities.CountAsync(x => x.ProviderSubject == validator.Subject));
        Assert.Equal(1, await db.PolicyAcceptances.CountAsync(x => x.UserId == created.Id));
    }

    [Theory]
    [InlineData("Testing", "Development", false, true)]
    [InlineData("Production", "Development", false, false)]
    [InlineData("Testing", "Google", true, true)]
    [InlineData("Production", "Google", false, false)]
    [InlineData("Testing", "Disabled", false, true)]
    public async Task CapabilitiesReflectRealProviderAndLegalAvailability(string environment, string mode, bool available, bool policyAvailable)
    {
        using var configured = factory.WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(environment);
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Auth:Google:Mode"] = mode, ["Auth:Google:ClientId"] = ClientId
            }));
        });
        using var client = configured.CreateClient();
        var response = await client.GetAsync("/api/v1/auth/capabilities");
        response.EnsureSuccessStatusCode();
        var capabilities = await response.Content.ReadFromJsonAsync<AuthCapabilities>();
        Assert.NotNull(capabilities);
        Assert.Equal(available, capabilities.GoogleSignInAvailable);
        Assert.Equal(policyAvailable, capabilities.PolicyAcceptanceAvailable);
        Assert.Equal(available ? ClientId : null, capabilities.GoogleClientId);
        Assert.False(capabilities.PhoneVerificationAvailable);
        Assert.True(response.Headers.CacheControl!.NoStore);

        using var scope = configured.Services.CreateScope();
        var verifier = scope.ServiceProvider.GetRequiredService<IGoogleIdentityVerifier>();
        if (mode == "Google")
        {
            Assert.IsType<GoogleTokenVerifier>(verifier);
            var error = await Assert.ThrowsAsync<ApiException>(() => verifier.VerifyAsync("dev-google:subject:email:Name:Surname"));
            Assert.Equal(401, error.StatusCode);
        }
        else if (environment == "Testing" && mode == "Development") Assert.IsType<DevelopmentGoogleIdentityVerifier>(verifier);
        else Assert.IsType<UnsupportedGoogleIdentityVerifier>(verifier);
        if (environment == "Production") Assert.IsType<UnsupportedSmsSender>(scope.ServiceProvider.GetRequiredService<ISmsSender>());
    }

    [Fact]
    public async Task GoogleModeWithoutClientIdDoesNotFallBackToDevelopment()
    {
        using var configured = factory.WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((_, config) =>
            config.AddInMemoryCollection(new Dictionary<string, string?> { ["Auth:Google:Mode"] = "Google", ["Auth:Google:ClientId"] = "" })));
        using var client = configured.CreateClient();
        var response = await SignIn(client, Guid.NewGuid().ToString(), "misconfigured@example.com");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("AUTH_NOT_CONFIGURED", await response.Content.ReadAsStringAsync());
        Assert.False((await client.GetFromJsonAsync<AuthCapabilities>("/api/v1/auth/capabilities"))!.GoogleSignInAvailable);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }

    [Fact]
    public async Task DifferentGoogleSubjectWithSameEmailCannotTakeOverAdminAccount()
    {
        var email = $"{Guid.NewGuid():N}@example.com";
        using var owner = factory.CreateClient();
        var ownerResponse = await SignIn(owner, Guid.NewGuid().ToString(), email);
        ownerResponse.EnsureSuccessStatusCode();
        var original = (await ownerResponse.Content.ReadFromJsonAsync<CurrentUserDto>(ApiJson.Options))!;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            var user = await db.Users.SingleAsync(x => x.Id == original.Id);
            user.Role = UserRole.Admin;
            user.Phone = "+972501234567";
            user.PhoneVerified = true;
            await db.SaveChangesAsync();
        }
        using var other = factory.CreateClient();
        var response = await SignIn(other, Guid.NewGuid().ToString(), email);
        response.EnsureSuccessStatusCode();
        var created = (await response.Content.ReadFromJsonAsync<CurrentUserDto>(ApiJson.Options))!;
        Assert.NotEqual(original.Id, created.Id);
        Assert.Equal(UserRole.Customer, created.Role);
        Assert.False(created.PhoneVerified);
        Assert.Null(created.Phone);
        Assert.Equal(UserRole.Admin, (await owner.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me", ApiJson.Options))!.Role);
        Assert.Equal(created.Id, (await other.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me", ApiJson.Options))!.Id);
        using var check = factory.Services.CreateScope();
        Assert.Equal(2, await check.ServiceProvider.GetRequiredService<MovelyDbContext>().Users.CountAsync(x => x.Email == email));
    }

    [Fact]
    public async Task SuspendedAccountCannotObtainNewSession()
    {
        var subject = Guid.NewGuid().ToString();
        var email = $"{Guid.NewGuid():N}@example.com";
        using var first = factory.CreateClient();
        var initial = await SignIn(first, subject, email);
        initial.EnsureSuccessStatusCode();
        var user = (await initial.Content.ReadFromJsonAsync<CurrentUserDto>(ApiJson.Options))!;
        int sessionCount;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            (await db.Users.SingleAsync(x => x.Id == user.Id)).Status = UserStatus.Suspended;
            await db.SaveChangesAsync();
            sessionCount = await db.UserSessions.CountAsync(x => x.UserId == user.Id);
        }
        using var second = factory.CreateClient();
        var blocked = await SignIn(second, subject, email);
        Assert.Equal(HttpStatusCode.Forbidden, blocked.StatusCode);
        Assert.Contains("ACCOUNT_UNAVAILABLE", await blocked.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Unauthorized, (await second.GetAsync("/api/v1/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await first.GetAsync("/api/v1/auth/me")).StatusCode);
        using var check = factory.Services.CreateScope();
        Assert.Equal(sessionCount, await check.ServiceProvider.GetRequiredService<MovelyDbContext>().UserSessions.CountAsync(x => x.UserId == user.Id));
    }

    private static async Task<HttpResponseMessage> SignIn(HttpClient client, string subject, string email)
    {
        var csrf = await client.GetFromJsonAsync<CsrfResponse>("/api/v1/auth/csrf");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf!.RequestToken);
        return await client.PostAsJsonAsync("/api/v1/auth/google/sign-in", new GoogleSignInRequest($"dev-google:{subject}:{email}:Test:Person", ConsentFixtures.Acceptance));
    }
    private sealed record CsrfResponse(string RequestToken);

    // Only Google's signature-validation boundary is substituted; real provider selection,
    // consent checks, identity persistence, CSRF and session issuance run through the API.
    private sealed class AcceptedValidator : IGoogleTokenValidator
    {
        public string Subject { get; } = Guid.NewGuid().ToString();
        public int Calls { get; private set; }
        public Task<GoogleJsonWebSignature.Payload> ValidateAsync(string credential, string clientId, CancellationToken cancellationToken)
        {
            Assert.Equal(ClientId, clientId);
            Assert.Equal("opaque-credential-from-google", credential);
            Calls++;
            return Task.FromResult(new GoogleJsonWebSignature.Payload
            {
                Subject = Subject, Email = $"{Subject}@example.com", EmailVerified = true,
                GivenName = "Google", FamilyName = "Test"
            });
        }
    }
}
