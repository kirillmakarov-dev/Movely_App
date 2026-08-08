using System.Security.Claims;
using Movely.Api.Data;

namespace Movely.Api.Shared.Authorization;

public sealed class CurrentUser : ICurrentUser
{
    private readonly ClaimsPrincipal _principal;

    public CurrentUser(IHttpContextAccessor httpContextAccessor)
    {
        _principal = httpContextAccessor.HttpContext?.User ?? new ClaimsPrincipal(new ClaimsIdentity());
    }

    public bool IsAuthenticated => _principal.Identity?.IsAuthenticated == true;

    public Guid? UserId => ReadGuid("movely_user_id");
    public string? FirstName => ReadString(ClaimTypes.GivenName);
    public string? LastName => ReadString(ClaimTypes.Surname);
    public string? Email => ReadString(ClaimTypes.Email);
    public string? Phone => ReadString("phone_number");
    public bool PhoneVerified => ReadBool("phone_verified");
    public UserRole? Role => Enum.TryParse<UserRole>(ReadString(ClaimTypes.Role), out var role) ? role : null;
    public BusinessStatus? BusinessStatus => Enum.TryParse<BusinessStatus>(ReadString("business_status"), out var status) ? status : null;
    public SubscriptionStatus? SubscriptionStatus => Enum.TryParse<SubscriptionStatus>(ReadString("subscription_status"), out var status) ? status : null;
    public Guid? BusinessId => ReadGuid("business_id");
    public Guid? SessionId => ReadGuid("movely_session_id");

    private string? ReadString(string type) => _principal.FindFirstValue(type);

    private Guid? ReadGuid(string type) => Guid.TryParse(ReadString(type), out var value) ? value : null;

    private bool ReadBool(string type) => bool.TryParse(ReadString(type), out var value) && value;
}

