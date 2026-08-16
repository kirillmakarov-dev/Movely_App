namespace Movely.Api.Data.Entities;

public sealed class MovePhoto
{
    public Guid Id { get; set; }
    public Guid MoveRequestVersionId { get; set; }
    public string ObjectKey { get; set; } = string.Empty;
    public string? OriginalFileName { get; set; }
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public int DisplayOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public MoveRequestVersion? MoveRequestVersion { get; set; }
}
