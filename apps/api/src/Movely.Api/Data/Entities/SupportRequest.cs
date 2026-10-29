namespace Movely.Api.Data.Entities;

public sealed class SupportRequest
{
    public Guid Id { get; set; }
    public Guid OwnerUserId { get; set; }
    public Guid ClientMutationId { get; set; }
    public SupportRequestType Type { get; set; }
    public string Subject { get; set; } = string.Empty;
    public SupportRequestStatus Status { get; set; }
    public Guid RevisionId { get; set; }
    public int LastSequenceNumber { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public MovelyUser? OwnerUser { get; set; }
    public ICollection<SupportRequestEvent> Events { get; set; } = new List<SupportRequestEvent>();
}
