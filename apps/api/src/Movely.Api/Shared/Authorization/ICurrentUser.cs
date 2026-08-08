using Movely.Api.Data;

namespace Movely.Api.Shared.Authorization;

public interface ICurrentUser
{
    bool IsAuthenticated { get; }
    Guid? UserId { get; }
    string? FirstName { get; }
    string? LastName { get; }
    string? Email { get; }
    string? Phone { get; }
    bool PhoneVerified { get; }
    UserRole? Role { get; }
    BusinessStatus? BusinessStatus { get; }
    SubscriptionStatus? SubscriptionStatus { get; }
    Guid? BusinessId { get; }
    Guid? SessionId { get; }
}

