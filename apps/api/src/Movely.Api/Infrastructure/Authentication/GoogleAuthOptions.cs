namespace Movely.Api.Infrastructure.Authentication;

public sealed class GoogleAuthOptions
{
    public string Mode { get; set; } = "Development";
    public string? ClientId { get; set; }

    public bool IsGoogleConfigured => string.Equals(Mode, "Google", StringComparison.OrdinalIgnoreCase)
        && !string.IsNullOrWhiteSpace(ClientId)
        && ClientId.Length > ".apps.googleusercontent.com".Length && ClientId.Length <= 255
        && ClientId.EndsWith(".apps.googleusercontent.com", StringComparison.Ordinal)
        && !ClientId.Any(char.IsWhiteSpace);
}

