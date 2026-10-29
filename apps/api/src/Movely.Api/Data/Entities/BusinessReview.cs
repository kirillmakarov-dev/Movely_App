namespace Movely.Api.Data.Entities;

public sealed class BusinessReview
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public BusinessStatus PreviousStatus { get; set; }
    public BusinessStatus Status { get; set; }
    public Guid ProfileRevisionId { get; set; }
    public DateTimeOffset ReviewedAt { get; set; }
    public Guid ReviewedByUserId { get; set; }
    public string? OwnerMessage { get; set; }
    public string? InternalNotes { get; set; }
    public bool RegistryChecked { get; set; }
    public bool RepresentativeChecked { get; set; }
    public string ProfileSnapshotJson { get; set; } = "{}";
    public Business? Business { get; set; }
}
