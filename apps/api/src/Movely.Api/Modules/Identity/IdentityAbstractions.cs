using Movely.Api.Data;

namespace Movely.Api.Modules.Identity;

public sealed record GoogleIdentity(string ProviderSubject, string Email, string FirstName, string LastName);

public sealed record CurrentUserDto(
    Guid Id,
    string FirstName,
    string LastName,
    string? Email,
    string? Phone,
    bool PhoneVerified,
    UserRole Role,
    BusinessStatus? BusinessStatus,
    SubscriptionStatus? SubscriptionStatus,
    Guid? BusinessId,
    bool HasCurrentPolicyAcceptance = false);

public sealed record GoogleSignInRequest(string Credential, PolicyAcceptanceRequest? Acceptance = null);

public sealed record PhoneRequestCodeRequest(string Phone);

public sealed record PhoneVerifyCodeRequest(string Phone, string Code);

public sealed record RequestPhoneCodeResponse(string NormalizedPhone, string? DebugCode, DateTimeOffset ExpiresAt);

public sealed record VerifyPhoneCodeResponse(bool PhoneVerified, string NormalizedPhone);

