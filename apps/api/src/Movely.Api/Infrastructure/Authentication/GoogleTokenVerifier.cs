using Google.Apis.Auth;
using Movely.Api.Modules.Identity;
using Movely.Api.Shared.Errors;

namespace Movely.Api.Infrastructure.Authentication;

public interface IGoogleTokenValidator
{
    Task<GoogleJsonWebSignature.Payload> ValidateAsync(string credential, string clientId, CancellationToken cancellationToken);
}

public sealed class GoogleTokenValidator : IGoogleTokenValidator
{
    public Task<GoogleJsonWebSignature.Payload> ValidateAsync(string credential, string clientId, CancellationToken cancellationToken)
        => GoogleJsonWebSignature.ValidateAsync(credential, new GoogleJsonWebSignature.ValidationSettings
        {
            Audience = [clientId],
            ExpirationTimeClockTolerance = TimeSpan.Zero
        }).WaitAsync(TimeSpan.FromSeconds(10), cancellationToken);
}

public sealed class GoogleTokenVerifier(GoogleAuthOptions options, IGoogleTokenValidator validator) : IGoogleIdentityVerifier
{
    public async Task<GoogleIdentity> VerifyAsync(string credential, CancellationToken cancellationToken = default)
    {
        if (!options.IsGoogleConfigured) throw new ApiException("AUTH_NOT_CONFIGURED", "Google sign-in is unavailable.", 503);
        if (string.IsNullOrWhiteSpace(credential) || credential.Length > 16_384 || credential.StartsWith("dev-google:", StringComparison.Ordinal))
            throw InvalidCredential();
        try
        {
            var payload = await validator.ValidateAsync(credential, options.ClientId!, cancellationToken);
            if (string.IsNullOrWhiteSpace(payload.Subject) || payload.Subject.Length > 255
                || string.IsNullOrWhiteSpace(payload.Email) || payload.Email.Length > 320 || !payload.EmailVerified)
                throw InvalidCredential();
            return new GoogleIdentity(payload.Subject, payload.Email, Name(payload.GivenName), Name(payload.FamilyName));
        }
        catch (InvalidJwtException) { throw InvalidCredential(); }
        catch (HttpRequestException) { throw new ApiException("AUTH_PROVIDER_UNAVAILABLE", "Google sign-in is temporarily unavailable.", 503); }
        catch (TimeoutException) { throw new ApiException("AUTH_PROVIDER_UNAVAILABLE", "Google sign-in is temporarily unavailable.", 503); }
    }

    private static string Name(string? value)
    {
        if (value is null) return "";
        if (value.Length <= 100) return value;
        var length = char.IsHighSurrogate(value[99]) && char.IsLowSurrogate(value[100]) ? 99 : 100;
        return value[..length];
    }
    private static ApiException InvalidCredential() => new("INVALID_AUTH_CREDENTIAL", "Google sign-in could not be verified.", 401);
}
