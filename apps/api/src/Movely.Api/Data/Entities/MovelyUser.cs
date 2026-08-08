namespace Movely.Api.Data.Entities;

using Movely.Api.Data;

public sealed class MovelyUser
{
    public Guid Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public bool PhoneVerified { get; set; }
    public UserRole Role { get; set; } = UserRole.Customer;
    public UserStatus Status { get; set; } = UserStatus.Active;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public ICollection<UserAuthIdentity> AuthIdentities { get; set; } = new List<UserAuthIdentity>();
    public ICollection<PhoneVerification> PhoneVerifications { get; set; } = new List<PhoneVerification>();
    public ICollection<Business> OwnedBusinesses { get; set; } = new List<Business>();
    public ICollection<UserSession> Sessions { get; set; } = new List<UserSession>();
}

