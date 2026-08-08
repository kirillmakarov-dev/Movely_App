namespace Movely.Api.Data.Entities;

using Movely.Api.Data;

public sealed class Business
{
    public Guid Id { get; set; }
    public Guid OwnerUserId { get; set; }
    public string? Name { get; set; }
    public BusinessStatus Status { get; set; } = BusinessStatus.PendingVerification;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public MovelyUser? OwnerUser { get; set; }
    public BusinessVerification? Verification { get; set; }
    public BusinessSubscription? Subscription { get; set; }
}

