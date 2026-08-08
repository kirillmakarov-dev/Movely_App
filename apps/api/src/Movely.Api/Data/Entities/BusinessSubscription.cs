namespace Movely.Api.Data.Entities;

using Movely.Api.Data;

public sealed class BusinessSubscription
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public SubscriptionStatus Status { get; set; } = SubscriptionStatus.Inactive;
    public DateTimeOffset? StartsAt { get; set; }
    public DateTimeOffset? EndsAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public Business? Business { get; set; }
}

