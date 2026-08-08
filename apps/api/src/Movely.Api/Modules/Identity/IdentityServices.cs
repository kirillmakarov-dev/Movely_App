using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Infrastructure.Authentication;
using Movely.Api.Shared.Errors;
using Movely.Api.Shared.Time;

namespace Movely.Api.Modules.Identity;

public interface IGoogleIdentityVerifier
{
    Task<GoogleIdentity> VerifyAsync(string credential, CancellationToken cancellationToken = default);
}

public sealed class DevelopmentGoogleIdentityVerifier : IGoogleIdentityVerifier
{
    private readonly GoogleAuthOptions _options;

    public DevelopmentGoogleIdentityVerifier(GoogleAuthOptions options)
    {
        _options = options;
    }

    public Task<GoogleIdentity> VerifyAsync(string credential, CancellationToken cancellationToken = default)
    {
        if (!credential.StartsWith("dev-google:", StringComparison.Ordinal))
        {
            throw new ApiException("INVALID_AUTH_CREDENTIAL", "Development Google credential format is invalid.");
        }

        var parts = credential.Split(':', 5);
        if (parts.Length < 5)
        {
            throw new ApiException("INVALID_AUTH_CREDENTIAL", "Development Google credential format is invalid.");
        }

        return Task.FromResult(new GoogleIdentity(parts[1], parts[2], parts[3], parts[4]));
    }
}

public sealed class UnsupportedGoogleIdentityVerifier : IGoogleIdentityVerifier
{
    private readonly string _message;

    public UnsupportedGoogleIdentityVerifier(string message)
    {
        _message = message;
    }

    public Task<GoogleIdentity> VerifyAsync(string credential, CancellationToken cancellationToken = default)
        => throw new NotSupportedException(_message);
}

public interface ISmsSender
{
    Task SendVerificationCodeAsync(string normalizedPhone, string code, CancellationToken cancellationToken = default);
}

public sealed class DevelopmentSmsSender : ISmsSender
{
    private readonly ILogger<DevelopmentSmsSender> _logger;

    public DevelopmentSmsSender(ILogger<DevelopmentSmsSender> logger)
    {
        _logger = logger;
    }

    public Task SendVerificationCodeAsync(string normalizedPhone, string code, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Development SMS OTP for {Phone}: {Code}", normalizedPhone, code);
        return Task.CompletedTask;
    }
}

public sealed class UnsupportedSmsSender : ISmsSender
{
    private readonly string _message;

    public UnsupportedSmsSender(string message)
    {
        _message = message;
    }

    public Task SendVerificationCodeAsync(string normalizedPhone, string code, CancellationToken cancellationToken = default)
        => throw new NotSupportedException(_message);
}

public interface IPhoneNormalizer
{
    string Normalize(string phone);
}

public sealed class IsraeliPhoneNormalizer : IPhoneNormalizer
{
    public string Normalize(string phone)
    {
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if (string.IsNullOrWhiteSpace(digits))
        {
            throw new ApiException("INVALID_PHONE_NUMBER", "Phone number is invalid.");
        }

        if (digits.StartsWith("972", StringComparison.Ordinal))
        {
            return $"+{digits}";
        }

        if (digits.StartsWith("0", StringComparison.Ordinal))
        {
            var stripped = digits.TrimStart('0');
            return $"+972{stripped}";
        }

        if (digits.StartsWith("972", StringComparison.Ordinal))
        {
            return $"+{digits}";
        }

        if (digits.Length >= 9 && digits.Length <= 15)
        {
            return $"+{digits}";
        }

        throw new ApiException("INVALID_PHONE_NUMBER", "Phone number is invalid.");
    }
}

public interface IOtpCodeHasher
{
    (string Salt, string Hash) Hash(string code);
    bool Verify(string code, string salt, string hash);
    string GenerateCode();
}

public sealed class OtpCodeHasher : IOtpCodeHasher
{
    public string GenerateCode()
    {
        var value = RandomNumberGenerator.GetInt32(0, 1_000_000);
        return value.ToString("D6");
    }

    public (string Salt, string Hash) Hash(string code)
    {
        var saltBytes = RandomNumberGenerator.GetBytes(16);
        var salt = Convert.ToBase64String(saltBytes);
        return (salt, ComputeHash(code, salt));
    }

    public bool Verify(string code, string salt, string hash)
        => CryptographicOperations.FixedTimeEquals(
            Convert.FromHexString(hash),
            Convert.FromHexString(ComputeHash(code, salt)));

    private static string ComputeHash(string code, string salt)
        => SecurityTokenHasher.HashOtp(code, salt);
}

public interface ISessionService
{
    Task<string> CreateSessionAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<bool> RevokeCurrentSessionAsync(string sessionToken, CancellationToken cancellationToken = default);
}

public sealed class SessionService : ISessionService
{
    private readonly MovelyDbContext _dbContext;
    private readonly IClock _clock;

    public SessionService(MovelyDbContext dbContext, IClock clock)
    {
        _dbContext = dbContext;
        _clock = clock;
    }

    public async Task<string> CreateSessionAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var rawToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
        var session = new UserSession
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            SessionTokenHash = SecurityTokenHasher.HashToken(rawToken),
            CreatedAt = _clock.UtcNow,
            LastSeenAt = _clock.UtcNow,
            ExpiresAt = _clock.UtcNow.AddDays(14)
        };

        _dbContext.UserSessions.Add(session);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return rawToken;
    }

    public async Task<bool> RevokeCurrentSessionAsync(string sessionToken, CancellationToken cancellationToken = default)
    {
        var tokenHash = SecurityTokenHasher.HashToken(sessionToken);
        var session = await _dbContext.UserSessions.SingleOrDefaultAsync(x => x.SessionTokenHash == tokenHash, cancellationToken);
        if (session is null)
        {
            return false;
        }

        session.RevokedAt = _clock.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }
}

public interface IGoogleIdentityLinker
{
    Task<MovelyUser> LinkOrCreateUserAsync(GoogleIdentity identity, CancellationToken cancellationToken = default);
}

public sealed class GoogleIdentityLinker : IGoogleIdentityLinker
{
    private readonly MovelyDbContext _dbContext;
    private readonly IClock _clock;

    public GoogleIdentityLinker(MovelyDbContext dbContext, IClock clock)
    {
        _dbContext = dbContext;
        _clock = clock;
    }

    public async Task<MovelyUser> LinkOrCreateUserAsync(GoogleIdentity identity, CancellationToken cancellationToken = default)
    {
        var existingIdentity = await _dbContext.UserAuthIdentities
            .Include(x => x.User)
            .SingleOrDefaultAsync(x => x.Provider == AuthProvider.Google && x.ProviderSubject == identity.ProviderSubject, cancellationToken);

        if (existingIdentity?.User is not null)
        {
            return existingIdentity.User;
        }

        var existingUser = await _dbContext.Users
            .SingleOrDefaultAsync(x => x.Email != null && x.Email == identity.Email, cancellationToken);

        var user = existingUser ?? new MovelyUser
        {
            Id = Guid.NewGuid(),
            FirstName = identity.FirstName,
            LastName = identity.LastName,
            Email = identity.Email,
            Role = UserRole.Customer,
            Status = UserStatus.Active,
            CreatedAt = _clock.UtcNow
        };

        user.FirstName = identity.FirstName;
        user.LastName = identity.LastName;
        user.Email = identity.Email;
        user.UpdatedAt = _clock.UtcNow;

        if (existingUser is null)
        {
            _dbContext.Users.Add(user);
        }

        var authIdentity = new UserAuthIdentity
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Provider = AuthProvider.Google,
            ProviderSubject = identity.ProviderSubject,
            CreatedAt = _clock.UtcNow
        };

        _dbContext.UserAuthIdentities.Add(authIdentity);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return user;
    }
}

public interface IAuthService
{
    Task<CurrentUserDto> SignInWithGoogleAsync(string credential, HttpContext httpContext, CancellationToken cancellationToken = default);
    Task<RequestPhoneCodeResponse> RequestPhoneCodeAsync(Guid userId, string phone, bool includeDebugCode, CancellationToken cancellationToken = default);
    Task<VerifyPhoneCodeResponse> VerifyPhoneCodeAsync(Guid userId, string phone, string code, CancellationToken cancellationToken = default);
    Task LogoutAsync(HttpContext httpContext, CancellationToken cancellationToken = default);
    Task<CurrentUserDto> GetCurrentUserAsync(Guid userId, CancellationToken cancellationToken = default);
}

public sealed class AuthService : IAuthService
{
    private readonly MovelyDbContext _dbContext;
    private readonly IGoogleIdentityVerifier _googleIdentityVerifier;
    private readonly IGoogleIdentityLinker _googleIdentityLinker;
    private readonly ISessionService _sessionService;
    private readonly ISmsSender _smsSender;
    private readonly IPhoneNormalizer _phoneNormalizer;
    private readonly IOtpCodeHasher _otpCodeHasher;
    private readonly IAuthAbuseGuard _authAbuseGuard;
    private readonly IClock _clock;
    private readonly IHostEnvironment _environment;

    public AuthService(
        MovelyDbContext dbContext,
        IGoogleIdentityVerifier googleIdentityVerifier,
        IGoogleIdentityLinker googleIdentityLinker,
        ISessionService sessionService,
        ISmsSender smsSender,
        IPhoneNormalizer phoneNormalizer,
        IOtpCodeHasher otpCodeHasher,
        IAuthAbuseGuard authAbuseGuard,
        IClock clock,
        IHostEnvironment environment)
    {
        _dbContext = dbContext;
        _googleIdentityVerifier = googleIdentityVerifier;
        _googleIdentityLinker = googleIdentityLinker;
        _sessionService = sessionService;
        _smsSender = smsSender;
        _phoneNormalizer = phoneNormalizer;
        _otpCodeHasher = otpCodeHasher;
        _authAbuseGuard = authAbuseGuard;
        _clock = clock;
        _environment = environment;
    }

    public async Task<CurrentUserDto> SignInWithGoogleAsync(string credential, HttpContext httpContext, CancellationToken cancellationToken = default)
    {
        var googleIdentity = await _googleIdentityVerifier.VerifyAsync(credential, cancellationToken);
        var user = await _googleIdentityLinker.LinkOrCreateUserAsync(googleIdentity, cancellationToken);
        await IssueSessionCookieAsync(httpContext, user.Id, cancellationToken);
        return await GetCurrentUserAsync(user.Id, cancellationToken);
    }

    public async Task<RequestPhoneCodeResponse> RequestPhoneCodeAsync(Guid userId, string phone, bool includeDebugCode, CancellationToken cancellationToken = default)
    {
        var normalizedPhone = _phoneNormalizer.Normalize(phone);
        var now = _clock.UtcNow;
        await _authAbuseGuard.EnsureOtpRequestAllowedAsync(normalizedPhone, null, cancellationToken);

        var activeChallenges = await _dbContext.PhoneVerifications
            .Where(x => x.UserId == userId &&
                        x.NormalizedPhone == normalizedPhone &&
                        x.Purpose == PhoneVerificationPurpose.CustomerPublishVerification &&
                        x.VerifiedAt == null &&
                        x.ConsumedAt == null)
            .ToListAsync(cancellationToken);

        var activeChallenge = activeChallenges
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefault();

        if (activeChallenge is not null && activeChallenge.ExpiresAt > now && activeChallenge.ResendAvailableAt > now)
        {
            throw new ApiException("OTP_RESEND_COOLDOWN", "OTP resend cooldown is active.");
        }

        if (activeChallenge is not null && activeChallenge.ExpiresAt > now && activeChallenge.AttemptCount >= activeChallenge.MaxAttempts)
        {
            throw new ApiException("OTP_ATTEMPT_LIMIT_REACHED", "OTP attempt limit reached.");
        }

        var code = _otpCodeHasher.GenerateCode();
        var (salt, hash) = _otpCodeHasher.Hash(code);

        var challenge = activeChallenge ?? new PhoneVerification
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            NormalizedPhone = normalizedPhone,
            Purpose = PhoneVerificationPurpose.CustomerPublishVerification,
            CreatedAt = now
        };

        challenge.CodeSalt = salt;
        challenge.CodeHash = hash;
        challenge.AttemptCount = 0;
        challenge.MaxAttempts = 5;
        challenge.ExpiresAt = now.AddMinutes(10);
        challenge.ResendAvailableAt = now.AddSeconds(60);
        challenge.UpdatedAt = now;
        challenge.VerifiedAt = null;
        challenge.ConsumedAt = null;

        if (activeChallenge is null)
        {
            _dbContext.PhoneVerifications.Add(challenge);
        }

        var user = await _dbContext.Users.SingleAsync(x => x.Id == userId, cancellationToken);
        if (!string.Equals(user.Phone, normalizedPhone, StringComparison.Ordinal))
        {
            user.PhoneVerified = false;
            user.Phone = normalizedPhone;
        }

        user.UpdatedAt = now;

        await _dbContext.SaveChangesAsync(cancellationToken);
        await _smsSender.SendVerificationCodeAsync(normalizedPhone, code, cancellationToken);

        return new RequestPhoneCodeResponse(
            normalizedPhone,
            includeDebugCode && (_environment.IsDevelopment() || _environment.IsEnvironment("Testing")) ? code : null,
            challenge.ExpiresAt);
    }

    public async Task<VerifyPhoneCodeResponse> VerifyPhoneCodeAsync(Guid userId, string phone, string code, CancellationToken cancellationToken = default)
    {
        var normalizedPhone = _phoneNormalizer.Normalize(phone);
        await _authAbuseGuard.EnsureOtpVerificationAllowedAsync(normalizedPhone, null, cancellationToken);
        var challenges = await _dbContext.PhoneVerifications
            .Where(x => x.UserId == userId &&
                        x.NormalizedPhone == normalizedPhone &&
                        x.Purpose == PhoneVerificationPurpose.CustomerPublishVerification &&
                        x.ConsumedAt == null)
            .ToListAsync(cancellationToken);

        var challenge = challenges
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefault();

        if (challenge is null)
        {
            throw new ApiException("OTP_NOT_FOUND", "OTP challenge not found.");
        }

        if (challenge.ExpiresAt <= _clock.UtcNow)
        {
            throw new ApiException("OTP_EXPIRED", "OTP has expired.");
        }

        if (challenge.AttemptCount >= challenge.MaxAttempts)
        {
            throw new ApiException("OTP_ATTEMPT_LIMIT_REACHED", "OTP attempt limit reached.");
        }

        challenge.AttemptCount += 1;
        challenge.UpdatedAt = _clock.UtcNow;

        if (!_otpCodeHasher.Verify(code, challenge.CodeSalt, challenge.CodeHash))
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
            throw new ApiException("OTP_CODE_INVALID", "OTP code is invalid.");
        }

        challenge.VerifiedAt = _clock.UtcNow;
        challenge.ConsumedAt = _clock.UtcNow;
        challenge.UpdatedAt = _clock.UtcNow;

        var user = await _dbContext.Users.SingleAsync(x => x.Id == userId, cancellationToken);
        user.Phone = normalizedPhone;
        user.PhoneVerified = true;
        user.UpdatedAt = _clock.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);
        return new VerifyPhoneCodeResponse(true, normalizedPhone);
    }

    public async Task LogoutAsync(HttpContext httpContext, CancellationToken cancellationToken = default)
    {
        if (httpContext.Request.Cookies.TryGetValue(AuthenticationConstants.SessionCookieName, out var token) &&
            !string.IsNullOrWhiteSpace(token))
        {
            await _sessionService.RevokeCurrentSessionAsync(token, cancellationToken);
        }

        httpContext.Response.Cookies.Delete(AuthenticationConstants.SessionCookieName);
    }

    public async Task<CurrentUserDto> GetCurrentUserAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await _dbContext.Users
            .Include(x => x.OwnedBusinesses)
            .ThenInclude(x => x.Subscription)
            .SingleAsync(x => x.Id == userId, cancellationToken);

        var business = user.OwnedBusinesses.FirstOrDefault();

        return new CurrentUserDto(
            user.Id,
            user.FirstName,
            user.LastName,
            user.Email,
            user.Phone,
            user.PhoneVerified,
            user.Role,
            business?.Status,
            business?.Subscription?.Status,
            business?.Id);
    }

    private async Task IssueSessionCookieAsync(HttpContext httpContext, Guid userId, CancellationToken cancellationToken)
    {
        var rawToken = await _sessionService.CreateSessionAsync(userId, cancellationToken);
        var cookieOptions = new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Lax,
            Secure = !_environment.IsDevelopment() && !_environment.IsEnvironment("Testing"),
            IsEssential = true,
            Expires = _clock.UtcNow.AddDays(14)
        };

        httpContext.Response.Cookies.Append(AuthenticationConstants.SessionCookieName, rawToken, cookieOptions);
    }
}
