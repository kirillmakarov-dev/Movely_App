namespace Movely.Api.Shared.Time;

public interface IClock
{
    DateTimeOffset UtcNow { get; }
}

