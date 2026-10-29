using Google.Apis.Auth;
using Movely.Api.Infrastructure.Authentication;
using Movely.Api.Shared.Errors;

namespace Movely.Api.Tests;

public sealed class GoogleTokenVerifierTests
{
    private const string ClientId = "123-release.apps.googleusercontent.com";
    private static GoogleAuthOptions Options() => new() { Mode = "Google", ClientId = ClientId };
    private static GoogleJsonWebSignature.Payload Payload() => new()
    {
        Subject = "google-subject", Email = "person@example.com", EmailVerified = true,
        GivenName = "אור", FamilyName = "כהן"
    };

    [Fact]
    public async Task ValidatedIdentityUsesConfiguredAudienceAndPreservesProviderSubject()
    {
        var validator = new StubValidator();
        using var cancellation = new CancellationTokenSource();
        var identity = await new GoogleTokenVerifier(Options(), validator).VerifyAsync("token-from-google", cancellation.Token);
        Assert.Equal(ClientId, validator.ClientId);
        Assert.Equal("token-from-google", validator.Credential);
        Assert.Equal(cancellation.Token, validator.Cancellation);
        Assert.Equal("google-subject", identity.ProviderSubject);
        Assert.Equal("person@example.com", identity.Email);
        Assert.Equal("אור", identity.FirstName);
    }

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("dev-google:any:user@example.com:Name:Surname")]
    public async Task EmptyOrDevelopmentCredentialsNeverReachGoogle(string credential)
    {
        var validator = new StubValidator();
        var error = await Assert.ThrowsAsync<ApiException>(() => new GoogleTokenVerifier(Options(), validator).VerifyAsync(credential));
        Assert.Equal(401, error.StatusCode);
        Assert.Equal("INVALID_AUTH_CREDENTIAL", error.ErrorCode);
        Assert.Equal(0, validator.Calls);
    }

    [Fact]
    public async Task OversizedCredentialIsRejectedBeforeExternalRequest()
    {
        var validator = new StubValidator();
        await Assert.ThrowsAsync<ApiException>(() => new GoogleTokenVerifier(Options(), validator).VerifyAsync(new string('a', 16_385)));
        Assert.Equal(0, validator.Calls);
    }

    [Theory]
    [InlineData("Development", ClientId)]
    [InlineData("Google", null)]
    [InlineData("Google", "")]
    [InlineData("Google", "wrong-client")]
    [InlineData("Google", ".apps.googleusercontent.com")]
    [InlineData("Google", "with space.apps.googleusercontent.com")]
    [InlineData(null, ClientId)]
    public async Task InvalidConfigurationFailsClosedWithoutTokenValidation(string? mode, string? clientId)
    {
        var validator = new StubValidator();
        var options = new GoogleAuthOptions { Mode = mode!, ClientId = clientId };
        var error = await Assert.ThrowsAsync<ApiException>(() => new GoogleTokenVerifier(options, validator).VerifyAsync("token"));
        Assert.Equal(503, error.StatusCode);
        Assert.Equal("AUTH_NOT_CONFIGURED", error.ErrorCode);
        Assert.Equal(0, validator.Calls);
    }

    [Theory]
    [InlineData("subject")]
    [InlineData("email")]
    [InlineData("unverified")]
    [InlineData("long-subject")]
    [InlineData("long-email")]
    public async Task MissingOrUnusableClaimsCannotCreateAnIdentity(string invalid)
    {
        var payload = Payload();
        if (invalid == "subject") payload.Subject = "";
        if (invalid == "email") payload.Email = "";
        if (invalid == "unverified") payload.EmailVerified = false;
        if (invalid == "long-subject") payload.Subject = new string('a', 256);
        if (invalid == "long-email") payload.Email = new string('a', 321);
        var validator = new StubValidator { Result = payload };
        var error = await Assert.ThrowsAsync<ApiException>(() => new GoogleTokenVerifier(Options(), validator).VerifyAsync("token"));
        Assert.Equal(401, error.StatusCode);
    }

    [Fact]
    public async Task NamesFitStorageWithoutSplittingUnicodeCharacters()
    {
        var payload = Payload();
        payload.GivenName = new string('א', 99) + "🚚";
        payload.FamilyName = null;
        var identity = await new GoogleTokenVerifier(Options(), new StubValidator { Result = payload }).VerifyAsync("token");
        Assert.Equal(new string('א', 99), identity.FirstName);
        Assert.Equal("", identity.LastName);
    }

    [Fact]
    public async Task SignatureAudienceIssuerOrExpiryFailureReturnsGenericUnauthorized()
    {
        var validator = new StubValidator { Failure = new InvalidJwtException("Do not expose token or validation internals") };
        var error = await Assert.ThrowsAsync<ApiException>(() => new GoogleTokenVerifier(Options(), validator).VerifyAsync("token"));
        Assert.Equal(401, error.StatusCode);
        Assert.DoesNotContain("internals", error.Message);
        Assert.Null(error.InnerException);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ProviderNetworkFailureReturnsUnavailable(bool timeout)
    {
        var validator = new StubValidator { Failure = timeout ? new TimeoutException() : new HttpRequestException() };
        var error = await Assert.ThrowsAsync<ApiException>(() => new GoogleTokenVerifier(Options(), validator).VerifyAsync("token"));
        Assert.Equal(503, error.StatusCode);
        Assert.Equal("AUTH_PROVIDER_UNAVAILABLE", error.ErrorCode);
    }

    [Fact]
    public async Task RequestCancellationIsNotReportedAsBadCredentials()
    {
        var validator = new StubValidator { Failure = new OperationCanceledException() };
        await Assert.ThrowsAsync<OperationCanceledException>(() => new GoogleTokenVerifier(Options(), validator).VerifyAsync("token"));
    }

    private sealed class StubValidator : IGoogleTokenValidator
    {
        public GoogleJsonWebSignature.Payload Result { get; init; } = Payload();
        public Exception? Failure { get; init; }
        public int Calls { get; private set; }
        public string? ClientId { get; private set; }
        public string? Credential { get; private set; }
        public CancellationToken Cancellation { get; private set; }
        public Task<GoogleJsonWebSignature.Payload> ValidateAsync(string credential, string clientId, CancellationToken cancellationToken)
        {
            Calls++;
            ClientId = clientId; Credential = credential; Cancellation = cancellationToken;
            return Failure is null ? Task.FromResult(Result) : Task.FromException<GoogleJsonWebSignature.Payload>(Failure);
        }
    }
}
