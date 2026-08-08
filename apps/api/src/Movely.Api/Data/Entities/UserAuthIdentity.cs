namespace Movely.Api.Data.Entities;

using Movely.Api.Data;

public sealed class UserAuthIdentity
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public AuthProvider Provider { get; set; }
    public string ProviderSubject { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }

    public MovelyUser? User { get; set; }
}

