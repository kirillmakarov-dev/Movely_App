namespace Movely.Api.Data.Entities;

public sealed class SupportRequestEvent
{
    public Guid Id { get; set; }
    public Guid SupportRequestId { get; set; }
    public Guid ActorUserId { get; set; }
    public Guid ClientMutationId { get; set; }
    public Guid? ExpectedRevisionId { get; set; }
    public Guid RevisionId { get; set; }
    public int SequenceNumber { get; set; }
    public SupportEventActor Actor { get; set; }
    public SupportEventKind Kind { get; set; }
    public string? Body { get; set; }
    public SupportRequestStatus? RequestedStatus { get; set; }
    public SupportRequestStatus? PreviousStatus { get; set; }
    public SupportRequestStatus Status { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public SupportRequest? Request { get; set; }
}
