namespace Movely.Api.Data.Entities;

using Movely.Api.Data;

public sealed class MoveRequest
{
    public Guid Id { get; set; }
    public Guid CustomerUserId { get; set; }
    public MoveRequestType RequestType { get; set; }
    public MoveRequestStatus Status { get; set; } = MoveRequestStatus.Draft;
    public LeadSalesStatus LeadSalesStatus { get; set; } = LeadSalesStatus.Closed;
    public Guid? CurrentVersionId { get; set; }
    public int LeadPriceAgorot { get; set; }
    public int MaxLeadBuyers { get; set; }
    public int ActiveBuyerCount { get; set; }
    public bool DuplicateRisk { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? PublishedAt { get; set; }
    public DateTimeOffset? ClosedAt { get; set; }
    public DateTimeOffset? CancelledAt { get; set; }
    public DateTimeOffset? ExpiredAt { get; set; }

    public MovelyUser? CustomerUser { get; set; }
    public MoveRequestVersion? CurrentVersion { get; set; }
    public ICollection<MoveRequestVersion> Versions { get; set; } = new List<MoveRequestVersion>();
}
