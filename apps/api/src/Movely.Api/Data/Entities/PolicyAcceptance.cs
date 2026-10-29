namespace Movely.Api.Data.Entities;

public sealed class PolicyAcceptance
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string TermsVersion { get; set; } = string.Empty;
    public string PrivacyVersion { get; set; } = string.Empty;
    public bool AdultConfirmed { get; set; }
    public DateTimeOffset AcceptedAt { get; set; }
    public bool IsTestOnly { get; set; }
}

public sealed class ContactSharingAcceptance
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid MoveRequestId { get; set; }
    public Guid RequestVersionId { get; set; }
    public string DisclosureVersion { get; set; } = string.Empty;
    public int MaxRecipients { get; set; }
    public DateTimeOffset AcceptedAt { get; set; }
    public bool IsTestOnly { get; set; }
}
