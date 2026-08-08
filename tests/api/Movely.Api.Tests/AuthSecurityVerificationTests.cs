using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Infrastructure.Authentication;
using Movely.Api.Modules.Identity;
using Movely.Api.Shared.Authorization;

namespace Movely.Api.Tests;

[Trait("Category", "Integration")]
[Trait("Category", "Authorization")]
[Trait("Category", "SecurityRegression")]
public sealed class AuthSecurityVerificationTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public AuthSecurityVerificationTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task AnonymousRequest_ToProtectedMeEndpoint_ReturnsUnauthorized()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            HandleCookies = false,
            AllowAutoRedirect = false
        });

        var response = await client.GetAsync("/api/v1/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ForgedFrontendHeaders_DoNotAuthenticateRequest()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            HandleCookies = false,
            AllowAutoRedirect = false
        });

        client.DefaultRequestHeaders.Add("X-Frontend-Role", "Admin");
        client.DefaultRequestHeaders.Add("X-Frontend-PhoneVerified", "true");

        var response = await client.GetAsync("/api/v1/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task AuthenticationCookie_IsHttpOnlyAndSameSiteLax()
    {
        var client = CreateCookieClient(_factory);
        await IssueCsrfTokenAsync(client);

        var response = await client.PostAsJsonAsync(
            "/api/v1/auth/google/sign-in",
            new GoogleSignInRequest($"dev-google:{NewSubject()}:cookie@example.com:Cookie:User"));

        response.EnsureSuccessStatusCode();

        var setCookie = GetSessionCookieHeader(response);
        Assert.Contains("httponly", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=lax", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("secure", setCookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ProductionCookie_IsHttpOnlySecureAndSameSiteLax()
    {
        var factory = CreateProductionOverrideFactory(_factory);
        var client = CreateCookieClient(factory);
        await IssueCsrfTokenAsync(client);

        var response = await client.PostAsJsonAsync(
            "/api/v1/auth/google/sign-in",
            new GoogleSignInRequest($"dev-google:{NewSubject()}:prod-cookie@example.com:Prod:Cookie"));

        response.EnsureSuccessStatusCode();

        var setCookie = GetSessionCookieHeader(response);
        Assert.Contains("httponly", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=lax", setCookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ProductionEnvironment_DisablesDevelopmentOtpVisibility()
    {
        var factory = CreateProductionOverrideFactory(_factory);
        var client = CreateCookieClient(factory);
        await IssueCsrfTokenAsync(client);
        var signInResponse = await client.PostAsJsonAsync(
            "/api/v1/auth/google/sign-in",
            new GoogleSignInRequest($"dev-google:{NewSubject()}:prod-otp@example.com:Prod:Otp"));
        signInResponse.EnsureSuccessStatusCode();
        var sessionCookie = GetSessionCookieHeader(signInResponse);
        client.DefaultRequestHeaders.Remove("Cookie");
        client.DefaultRequestHeaders.Add("Cookie", sessionCookie.Split(';', 2)[0]);

        await IssueCsrfTokenAsync(client);
        var response = await client.PostAsJsonAsync(
            "/api/v1/auth/phone/request-code",
            new PhoneRequestCodeRequest(NewPhone()));

        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<RequestPhoneCodeResponse>();
        Assert.NotNull(payload);
        Assert.Null(payload!.DebugCode);
    }

    [Fact]
    public async Task ProductionEnvironment_DisablesDevelopmentHelpersByDefault()
    {
        var factory = _factory.WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Production");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IGoogleIdentityVerifier>();
                services.RemoveAll<ISmsSender>();
                services.AddScoped<IGoogleIdentityVerifier>(_ => new UnsupportedGoogleIdentityVerifier("production"));
                services.AddScoped<ISmsSender>(_ => new UnsupportedSmsSender("production"));
            });
        });

        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            HandleCookies = true,
            AllowAutoRedirect = false
        });

        await IssueCsrfTokenAsync(client);
        var response = await client.PostAsJsonAsync(
            "/api/v1/auth/google/sign-in",
            new GoogleSignInRequest($"dev-google:{NewSubject()}:blocked@example.com:Blocked:User"));

        Assert.False(response.IsSuccessStatusCode);
    }

    [Fact]
    public async Task SameGoogleSubject_DoesNotCreateDuplicateUser_OrIdentity()
    {
        var client = CreateCookieClient(_factory);
        await IssueCsrfTokenAsync(client);

        var subject = NewSubject();
        await SignInAsync(client, $"dev-google:{subject}:first@example.com:Alice:One");
        var firstUser = await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
        Assert.NotNull(firstUser);

        await IssueCsrfTokenAsync(client);
        await SignInAsync(client, $"dev-google:{subject}:second@example.com:Alice:Two");
        var secondUser = await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
        Assert.NotNull(secondUser);

        Assert.Equal(firstUser!.Id, secondUser!.Id);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        var identities = await db.UserAuthIdentities.Where(x => x.ProviderSubject == subject).CountAsync();
        Assert.Equal(1, identities);
    }

    [Fact]
    public async Task ChangingGoogleEmail_DoesNotCreateSecondAccount_WhenSubjectIsSame()
    {
        var client = CreateCookieClient(_factory);
        await IssueCsrfTokenAsync(client);

        var subject = NewSubject();
        await SignInAsync(client, $"dev-google:{subject}:alpha@example.com:Alpha:User");
        var firstUser = await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
        Assert.NotNull(firstUser);

        await IssueCsrfTokenAsync(client);
        await SignInAsync(client, $"dev-google:{subject}:beta@example.com:Alpha:User");
        var secondUser = await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
        Assert.NotNull(secondUser);

        Assert.Equal(firstUser!.Id, secondUser!.Id);
    }

    [Fact]
    public async Task CustomerRole_CannotSatisfyMoverOnlyPolicy()
    {
        var authorization = _factory.Services.GetRequiredService<IAuthorizationService>();
        var customer = BuildPrincipal(UserRole.Customer, phoneVerified: true);

        var result = await authorization.AuthorizeAsync(customer, null, AuthorizationExtensions.MoverOnly);

        Assert.False(result.Succeeded);
    }

    [Fact]
    public async Task MoverRole_CanSatisfyMoverOnlyPolicy()
    {
        var authorization = _factory.Services.GetRequiredService<IAuthorizationService>();
        var mover = BuildPrincipal(UserRole.Mover, phoneVerified: true, businessStatus: BusinessStatus.Verified);

        var result = await authorization.AuthorizeAsync(mover, null, AuthorizationExtensions.MoverOnly);

        Assert.True(result.Succeeded);
    }

    [Fact]
    public async Task PendingMover_CannotSatisfyVerifiedMoverPolicy()
    {
        var authorization = _factory.Services.GetRequiredService<IAuthorizationService>();
        var mover = BuildPrincipal(UserRole.Mover, phoneVerified: true, businessStatus: BusinessStatus.PendingVerification);

        var result = await authorization.AuthorizeAsync(mover, null, AuthorizationExtensions.VerifiedMover);

        Assert.False(result.Succeeded);
    }

    [Fact]
    public async Task VerifiedMover_CanSatisfyVerifiedMoverPolicy()
    {
        var authorization = _factory.Services.GetRequiredService<IAuthorizationService>();
        var mover = BuildPrincipal(UserRole.Mover, phoneVerified: true, businessStatus: BusinessStatus.Verified);

        var result = await authorization.AuthorizeAsync(mover, null, AuthorizationExtensions.VerifiedMover);

        Assert.True(result.Succeeded);
    }

    [Fact]
    public async Task SuspendedMover_CannotSatisfyVerifiedMoverPolicy()
    {
        var authorization = _factory.Services.GetRequiredService<IAuthorizationService>();
        var mover = BuildPrincipal(UserRole.Mover, phoneVerified: true, businessStatus: BusinessStatus.Suspended);

        var result = await authorization.AuthorizeAsync(mover, null, AuthorizationExtensions.VerifiedMover);

        Assert.False(result.Succeeded);
    }

    [Fact]
    public async Task RejectedMover_CannotSatisfyVerifiedMoverPolicy()
    {
        var authorization = _factory.Services.GetRequiredService<IAuthorizationService>();
        var mover = BuildPrincipal(UserRole.Mover, phoneVerified: true, businessStatus: BusinessStatus.Rejected);

        var result = await authorization.AuthorizeAsync(mover, null, AuthorizationExtensions.VerifiedMover);

        Assert.False(result.Succeeded);
    }

    [Fact]
    public async Task AdminRole_DoesNotSilentlyMakeBusinessVerified()
    {
        var authorization = _factory.Services.GetRequiredService<IAuthorizationService>();
        var admin = BuildPrincipal(UserRole.Admin, phoneVerified: true, businessStatus: BusinessStatus.PendingVerification);

        var result = await authorization.AuthorizeAsync(admin, null, AuthorizationExtensions.VerifiedMover);

        Assert.False(result.Succeeded);
    }

    [Fact]
    public async Task VerifiedPhoneCustomerPolicy_RequiresBackendVerifiedPhone()
    {
        var authorization = _factory.Services.GetRequiredService<IAuthorizationService>();
        var customer = BuildPrincipal(UserRole.Customer, phoneVerified: false);

        var result = await authorization.AuthorizeAsync(customer, null, AuthorizationExtensions.VerifiedPhoneCustomer);

        Assert.False(result.Succeeded);
    }

    [Fact]
    public async Task VerifiedPhoneCustomerPolicy_PassesWhenPhoneIsVerified()
    {
        var authorization = _factory.Services.GetRequiredService<IAuthorizationService>();
        var customer = BuildPrincipal(UserRole.Customer, phoneVerified: true);

        var result = await authorization.AuthorizeAsync(customer, null, AuthorizationExtensions.VerifiedPhoneCustomer);

        Assert.True(result.Succeeded);
    }

    [Fact]
    public async Task VerifiedPhoneState_PersistsAcrossNewSession()
    {
        var (client, userId) = await SignInVerifiedCustomerAsync();

        var before = await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
        Assert.NotNull(before);
        Assert.True(before!.PhoneVerified);

        var freshClient = CreateCookieClient(_factory);
        await AttachSessionAsync(_factory, freshClient, userId);

        var after = await freshClient.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
        Assert.NotNull(after);
        Assert.True(after!.PhoneVerified);
    }

    [Fact]
    public async Task StalePhoneVerifiedClaim_CannotOverrideBackendState()
    {
        var (client, userId) = await SignInVerifiedCustomerAsync();

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            var user = await db.Users.SingleAsync(x => x.Id == userId);
            user.PhoneVerified = false;
            user.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
        }

        var currentUser = await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
        Assert.NotNull(currentUser);
        Assert.False(currentUser!.PhoneVerified);
    }

    [Fact]
    public async Task PhoneChange_ResetsVerifiedState_AndRequiresNewOtp()
    {
        var (client, userId) = await SignInVerifiedCustomerAsync();
        var newPhone = NewPhone();

        await IssueCsrfTokenAsync(client);
        var requestResponse = await client.PostAsJsonAsync(
            "/api/v1/auth/phone/request-code",
            new PhoneRequestCodeRequest(newPhone));

        requestResponse.EnsureSuccessStatusCode();

        var currentUser = await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
        Assert.NotNull(currentUser);
        Assert.False(currentUser!.PhoneVerified);
        Assert.Equal(userId, currentUser.Id);
    }

    [Fact]
    public async Task CorrectOtp_Succeeds()
    {
        var (client, _) = await SignInUnverifiedCustomerAsync();
        var phone = NewPhone();

        var response = await RequestOtpAsync(client, phone);
        var code = Assert.IsType<RequestPhoneCodeResponse>(await response.Content.ReadFromJsonAsync<RequestPhoneCodeResponse>());

        await IssueCsrfTokenAsync(client);
        var verify = await client.PostAsJsonAsync("/api/v1/auth/phone/verify-code", new PhoneVerifyCodeRequest(phone, code.DebugCode!));

        verify.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task IncorrectOtp_Fails()
    {
        var (client, _) = await SignInUnverifiedCustomerAsync();
        var phone = NewPhone();

        await RequestOtpAsync(client, phone);

        await IssueCsrfTokenAsync(client);
        var verify = await client.PostAsJsonAsync("/api/v1/auth/phone/verify-code", new PhoneVerifyCodeRequest(phone, "000000"));

        Assert.False(verify.IsSuccessStatusCode);
    }

    [Fact]
    public async Task ExpiredOtp_Fails()
    {
        var (client, userId) = await SignInUnverifiedCustomerAsync();
        var phone = NewPhone();

        var response = await RequestOtpAsync(client, phone);
        var code = Assert.IsType<RequestPhoneCodeResponse>(await response.Content.ReadFromJsonAsync<RequestPhoneCodeResponse>());

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            var challenge = await db.PhoneVerifications.SingleAsync(x => x.UserId == userId && x.NormalizedPhone == new IsraeliPhoneNormalizer().Normalize(phone));
            challenge.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        }

        await IssueCsrfTokenAsync(client);
        var verify = await client.PostAsJsonAsync("/api/v1/auth/phone/verify-code", new PhoneVerifyCodeRequest(phone, code.DebugCode!));

        Assert.False(verify.IsSuccessStatusCode);
    }

    [Fact]
    public async Task UsedOtp_CannotBeReplayed()
    {
        var (client, _) = await SignInUnverifiedCustomerAsync();
        var phone = NewPhone();

        var response = await RequestOtpAsync(client, phone);
        var code = Assert.IsType<RequestPhoneCodeResponse>(await response.Content.ReadFromJsonAsync<RequestPhoneCodeResponse>());

        await IssueCsrfTokenAsync(client);
        var first = await client.PostAsJsonAsync("/api/v1/auth/phone/verify-code", new PhoneVerifyCodeRequest(phone, code.DebugCode!));
        first.EnsureSuccessStatusCode();

        await IssueCsrfTokenAsync(client);
        var second = await client.PostAsJsonAsync("/api/v1/auth/phone/verify-code", new PhoneVerifyCodeRequest(phone, code.DebugCode!));
        Assert.False(second.IsSuccessStatusCode);
    }

    [Fact]
    public async Task NewOtp_SupersedesPreviousOtp()
    {
        var (client, _) = await SignInUnverifiedCustomerAsync();
        var phone = NewPhone();

        var firstResponse = await RequestOtpAsync(client, phone);
        var firstCode = Assert.IsType<RequestPhoneCodeResponse>(await firstResponse.Content.ReadFromJsonAsync<RequestPhoneCodeResponse>());

        await ForceOtpResendWindowOpenAsync(phone);

        var secondResponse = await RequestOtpAsync(client, phone);
        var secondCode = Assert.IsType<RequestPhoneCodeResponse>(await secondResponse.Content.ReadFromJsonAsync<RequestPhoneCodeResponse>());

        await IssueCsrfTokenAsync(client);
        var replay = await client.PostAsJsonAsync("/api/v1/auth/phone/verify-code", new PhoneVerifyCodeRequest(phone, firstCode.DebugCode!));
        Assert.False(replay.IsSuccessStatusCode);

        await IssueCsrfTokenAsync(client);
        var current = await client.PostAsJsonAsync("/api/v1/auth/phone/verify-code", new PhoneVerifyCodeRequest(phone, secondCode.DebugCode!));
        current.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task RequestCode_IsRateLimited()
    {
        var (client, _) = await SignInUnverifiedCustomerAsync();
        var phone = NewPhone();

        await RequestOtpAsync(client, phone);
        await ForceOtpResendWindowOpenAsync(phone);
        await RequestOtpAsync(client, phone);
        await ForceOtpResendWindowOpenAsync(phone);
        await RequestOtpAsync(client, phone);
        await ForceOtpResendWindowOpenAsync(phone);

        await IssueCsrfTokenAsync(client);
        var fourth = await client.PostAsJsonAsync("/api/v1/auth/phone/request-code", new PhoneRequestCodeRequest(phone));

        Assert.Equal((HttpStatusCode)429, fourth.StatusCode);
    }

    [Fact]
    public async Task Verification_IsRateLimited()
    {
        var (client, _) = await SignInUnverifiedCustomerAsync();
        var phone = NewPhone();

        await RequestOtpAsync(client, phone);

        for (var attempt = 0; attempt < 4; attempt++)
        {
            await IssueCsrfTokenAsync(client);
            var response = await client.PostAsJsonAsync("/api/v1/auth/phone/verify-code", new PhoneVerifyCodeRequest(phone, "111111"));
            Assert.False(response.IsSuccessStatusCode);
        }

        await IssueCsrfTokenAsync(client);
        var limited = await client.PostAsJsonAsync("/api/v1/auth/phone/verify-code", new PhoneVerifyCodeRequest(phone, "111111"));

        Assert.Equal((HttpStatusCode)429, limited.StatusCode);
    }

    [Fact]
    public async Task RequestCode_HasCooldown()
    {
        var (client, _) = await SignInUnverifiedCustomerAsync();
        var phone = NewPhone();

        await RequestOtpAsync(client, phone);

        await IssueCsrfTokenAsync(client);
        var second = await client.PostAsJsonAsync("/api/v1/auth/phone/request-code", new PhoneRequestCodeRequest(phone));

        Assert.False(second.IsSuccessStatusCode);
    }

    [Fact]
    public async Task OTP_IsNotStoredAsPlaintext()
    {
        var (client, userId) = await SignInUnverifiedCustomerAsync();
        var phone = NewPhone();

        var response = await RequestOtpAsync(client, phone);
        var payload = Assert.IsType<RequestPhoneCodeResponse>(await response.Content.ReadFromJsonAsync<RequestPhoneCodeResponse>());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            var challenge = await db.PhoneVerifications.SingleAsync(x => x.UserId == userId && x.NormalizedPhone == new IsraeliPhoneNormalizer().Normalize(phone));

        Assert.NotEqual(payload.DebugCode, challenge.CodeHash);
        Assert.NotEqual(payload.DebugCode, challenge.CodeSalt);
        Assert.NotEqual(payload.DebugCode, string.Empty);
    }

    [Fact]
    public void WebSource_DoesNotReferenceLocalStorageOrSessionStorage_ForAuthState()
    {
        var repoRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", ".."));
        var sourceFiles = Directory.GetFiles(Path.Combine(repoRoot, "apps", "web", "src"), "*.*", SearchOption.AllDirectories);
        var combined = string.Join('\n', sourceFiles.Select(File.ReadAllText));

        Assert.DoesNotContain("localStorage", combined, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("sessionStorage", combined, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task RoleAndBusinessStatus_AreIndependentAndBackendAuthoritative()
    {
        var userId = Guid.NewGuid();
        var businessId = Guid.NewGuid();
        var sessionToken = await SeedMoverWithBusinessAsync(userId, businessId, UserRole.Mover, BusinessStatus.PendingVerification, SubscriptionStatus.Inactive);

        var client = CreateCookieClient(_factory);
        client.DefaultRequestHeaders.Add("Cookie", $"movely.session={sessionToken}");

        var initial = await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
        Assert.NotNull(initial);
        Assert.Equal(UserRole.Mover, initial!.Role);
        Assert.Equal(BusinessStatus.PendingVerification, initial.BusinessStatus);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            var business = await db.Businesses.SingleAsync(x => x.Id == businessId);
            business.Status = BusinessStatus.Verified;
            await db.SaveChangesAsync();
        }

        var afterBusinessChange = await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
        Assert.NotNull(afterBusinessChange);
        Assert.Equal(UserRole.Mover, afterBusinessChange!.Role);
        Assert.Equal(BusinessStatus.Verified, afterBusinessChange.BusinessStatus);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            var user = await db.Users.SingleAsync(x => x.Id == userId);
            user.Role = UserRole.Admin;
            await db.SaveChangesAsync();
        }

        var afterRoleChange = await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
        Assert.NotNull(afterRoleChange);
        Assert.Equal(UserRole.Admin, afterRoleChange!.Role);
        Assert.Equal(BusinessStatus.Verified, afterRoleChange.BusinessStatus);
    }

    [Fact]
    public async Task ChangingBusinessStatus_DoesNotMutateUserRole()
    {
        var userId = Guid.NewGuid();
        var businessId = Guid.NewGuid();
        await SeedMoverWithBusinessAsync(userId, businessId, UserRole.Mover, BusinessStatus.PendingVerification, SubscriptionStatus.Inactive);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            var business = await db.Businesses.SingleAsync(x => x.Id == businessId);
            business.Status = BusinessStatus.Verified;
            await db.SaveChangesAsync();
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            var user = await db.Users.SingleAsync(x => x.Id == userId);
            Assert.Equal(UserRole.Mover, user.Role);
        }
    }

    [Fact]
    public async Task ChangingUserRole_DoesNotMutateBusinessStatus()
    {
        var userId = Guid.NewGuid();
        var businessId = Guid.NewGuid();
        await SeedMoverWithBusinessAsync(userId, businessId, UserRole.Mover, BusinessStatus.PendingVerification, SubscriptionStatus.Inactive);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            var user = await db.Users.SingleAsync(x => x.Id == userId);
            user.Role = UserRole.Admin;
            await db.SaveChangesAsync();
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
            var business = await db.Businesses.SingleAsync(x => x.Id == businessId);
            Assert.Equal(BusinessStatus.PendingVerification, business.Status);
        }
    }

    [Fact]
    public async Task VerifiedPhoneCustomer_PersistsAcrossNewSession()
    {
        var (client, userId) = await SignInUnverifiedCustomerAsync();
        var phone = NewPhone();

        var request = await RequestOtpAsync(client, phone);
        var otp = Assert.IsType<RequestPhoneCodeResponse>(await request.Content.ReadFromJsonAsync<RequestPhoneCodeResponse>());

        await IssueCsrfTokenAsync(client);
        var verify = await client.PostAsJsonAsync("/api/v1/auth/phone/verify-code", new PhoneVerifyCodeRequest(phone, otp.DebugCode!));
        verify.EnsureSuccessStatusCode();

        var current = await client.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
        Assert.NotNull(current);
        Assert.True(current!.PhoneVerified);

        var freshClient = CreateCookieClient(_factory);
        await AttachSessionAsync(_factory, freshClient, userId);

        var freshCurrent = await freshClient.GetFromJsonAsync<CurrentUserDto>("/api/v1/auth/me");
        Assert.NotNull(freshCurrent);
        Assert.True(freshCurrent!.PhoneVerified);
    }

    private static WebApplicationFactory<Program> CreateProductionOverrideFactory(ApiFactory baseFactory)
    {
        return baseFactory.WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Production");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IGoogleIdentityVerifier>();
                services.RemoveAll<ISmsSender>();
                services.AddScoped<IGoogleIdentityVerifier>(_ => new DevelopmentGoogleIdentityVerifier(new GoogleAuthOptions()));
                services.AddScoped<ISmsSender>(_ => new NoOpSmsSender());
            });
        });
    }

    private static HttpClient CreateCookieClient(WebApplicationFactory<Program> factory)
        => factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            HandleCookies = true,
            AllowAutoRedirect = false
        });

    private static async Task IssueCsrfTokenAsync(HttpClient client)
    {
        var csrf = await client.GetFromJsonAsync<CsrfResponse>("/api/v1/auth/csrf");
        Assert.NotNull(csrf);
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf!.RequestToken);
    }

    private static async Task SignInAsync(HttpClient client, string credential)
    {
        var response = await client.PostAsJsonAsync("/api/v1/auth/google/sign-in", new GoogleSignInRequest(credential));
        response.EnsureSuccessStatusCode();
    }

    private async Task<(HttpClient Client, Guid UserId)> SignInVerifiedCustomerAsync()
    {
        var client = CreateCookieClient(_factory);
        await IssueCsrfTokenAsync(client);

        var subject = NewSubject();
        var credential = $"dev-google:{subject}:{subject}@example.com:Verified:Customer";
        var response = await client.PostAsJsonAsync("/api/v1/auth/google/sign-in", new GoogleSignInRequest(credential));
        response.EnsureSuccessStatusCode();

        var user = await response.Content.ReadFromJsonAsync<CurrentUserDto>();
        Assert.NotNull(user);

        await IssueCsrfTokenAsync(client);
        var phone = NewPhone();
        var request = await client.PostAsJsonAsync("/api/v1/auth/phone/request-code", new PhoneRequestCodeRequest(phone));
        request.EnsureSuccessStatusCode();
        var payload = Assert.IsType<RequestPhoneCodeResponse>(await request.Content.ReadFromJsonAsync<RequestPhoneCodeResponse>());

        await IssueCsrfTokenAsync(client);
        var verify = await client.PostAsJsonAsync("/api/v1/auth/phone/verify-code", new PhoneVerifyCodeRequest(phone, payload.DebugCode!));
        verify.EnsureSuccessStatusCode();

        return (client, user!.Id);
    }

    private async Task<(HttpClient Client, Guid UserId)> SignInUnverifiedCustomerAsync()
    {
        var client = CreateCookieClient(_factory);
        await IssueCsrfTokenAsync(client);

        var subject = NewSubject();
        var credential = $"dev-google:{subject}:{subject}@example.com:Unverified:Customer";
        var response = await client.PostAsJsonAsync("/api/v1/auth/google/sign-in", new GoogleSignInRequest(credential));
        response.EnsureSuccessStatusCode();

        var user = await response.Content.ReadFromJsonAsync<CurrentUserDto>();
        Assert.NotNull(user);
        return (client, user!.Id);
    }

    private async Task<HttpResponseMessage> RequestOtpAsync(HttpClient client, string phone)
    {
        await IssueCsrfTokenAsync(client);
        return await client.PostAsJsonAsync("/api/v1/auth/phone/request-code", new PhoneRequestCodeRequest(phone));
    }

    private async Task ForceOtpResendWindowOpenAsync(string phone)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        var normalizedPhone = new IsraeliPhoneNormalizer().Normalize(phone);
        var challenges = await db.PhoneVerifications
            .Where(x => x.NormalizedPhone == normalizedPhone)
            .ToListAsync();

        var challenge = challenges
            .OrderByDescending(x => x.CreatedAt)
            .First();

        challenge.ResendAvailableAt = DateTimeOffset.UtcNow.AddMinutes(-1);
        await db.SaveChangesAsync();
    }

    private async Task<string> SeedMoverWithBusinessAsync(
        Guid userId,
        Guid businessId,
        UserRole role,
        BusinessStatus businessStatus,
        SubscriptionStatus subscriptionStatus)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MovelyDbContext>();
        var sessionService = scope.ServiceProvider.GetRequiredService<ISessionService>();

        var now = DateTimeOffset.UtcNow;
        db.Users.Add(new MovelyUser
        {
            Id = userId,
            FirstName = "Mover",
            LastName = "User",
            Email = $"{userId:N}@example.com",
            Phone = "+972501234567",
            PhoneVerified = true,
            Role = role,
            Status = UserStatus.Active,
            CreatedAt = now,
            UpdatedAt = now
        });

        db.Businesses.Add(new Business
        {
            Id = businessId,
            OwnerUserId = userId,
            Name = "Movely Movers",
            Status = businessStatus,
            CreatedAt = now,
            UpdatedAt = now
        });

        db.BusinessSubscriptions.Add(new BusinessSubscription
        {
            Id = Guid.NewGuid(),
            BusinessId = businessId,
            Status = subscriptionStatus,
            CreatedAt = now,
            UpdatedAt = now
        });

        await db.SaveChangesAsync();
        return await sessionService.CreateSessionAsync(userId);
    }

    private static async Task AttachSessionAsync(ApiFactory factory, HttpClient client, Guid userId)
    {
        using var scope = factory.Services.CreateScope();
        var sessionService = scope.ServiceProvider.GetRequiredService<ISessionService>();
        var token = await sessionService.CreateSessionAsync(userId);
        client.DefaultRequestHeaders.Remove("Cookie");
        client.DefaultRequestHeaders.Add("Cookie", $"movely.session={token}");
    }

    private static ClaimsPrincipal BuildPrincipal(UserRole role, bool phoneVerified, BusinessStatus? businessStatus = null, SubscriptionStatus? subscriptionStatus = null)
    {
        var claims = new List<Claim>
        {
            new("movely_user_id", Guid.NewGuid().ToString()),
            new(ClaimTypes.Role, role.ToString()),
            new("phone_verified", phoneVerified ? bool.TrueString : bool.FalseString),
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

        return new ClaimsPrincipal(new ClaimsIdentity(claims, AuthenticationConstants.Scheme, ClaimTypes.Name, ClaimTypes.Role));
    }

    private static string GetSessionCookieHeader(HttpResponseMessage response)
    {
        var cookie = response.Headers.TryGetValues("Set-Cookie", out var values)
            ? values.FirstOrDefault(value => value.StartsWith($"{AuthenticationConstants.SessionCookieName}=", StringComparison.OrdinalIgnoreCase))
            : null;

        Assert.NotNull(cookie);
        return cookie!;
    }

    private static string NewPhone()
    {
        var seed = Interlocked.Increment(ref _seed);
        return $"0501234{seed % 1000:D3}";
    }

    private static string NewSubject()
        => $"subject-{Interlocked.Increment(ref _subjectSeed)}";

    private static int _seed;
    private static int _subjectSeed;

    private sealed class NoOpSmsSender : ISmsSender
    {
        public Task SendVerificationCodeAsync(string normalizedPhone, string code, CancellationToken cancellationToken = default)
            => Task.CompletedTask;
    }

    private sealed record CsrfResponse(string RequestToken);
}
