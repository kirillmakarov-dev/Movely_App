namespace Movely.Api.Data.Entities;

using Movely.Api.Data;

public sealed class BusinessVerification
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public BusinessStatus Status { get; set; } = BusinessStatus.PendingVerification;
    public Guid? ReviewedByUserId { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public Business? Business { get; set; }
}

