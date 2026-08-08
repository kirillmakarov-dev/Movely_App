namespace Movely.Api.Data.Entities;

using Movely.Api.Data;

public sealed class PhoneVerification
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string NormalizedPhone { get; set; } = string.Empty;
    public PhoneVerificationPurpose Purpose { get; set; }
    public string CodeSalt { get; set; } = string.Empty;
    public string CodeHash { get; set; } = string.Empty;
    public int AttemptCount { get; set; }
    public int MaxAttempts { get; set; } = 5;
    public DateTimeOffset ResendAvailableAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? VerifiedAt { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public MovelyUser? User { get; set; }
}

