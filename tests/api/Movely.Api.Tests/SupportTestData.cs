using Microsoft.Extensions.Options;
using Movely.Api.Data;
using Movely.Api.Modules.Support;
using Movely.Api.Shared.Time;

namespace Movely.Api.Tests;

internal static class SupportTestData
{
    public static CreateSupportRequest Create(Guid actorId, SupportRequestType type = SupportRequestType.General, Guid? mutation = null)
        => new(mutation ?? Guid.NewGuid(), type, "Request subject", "Please review this request.", actorId);
    public static SupportRequestService Service(MovelyDbContext db, SupportTestOptions? flags = null)
        => new(db, new SystemClock(), flags ?? new SupportTestOptions(true));
}
internal sealed class SupportTestOptions(bool enabled) : IOptionsMonitor<SupportOptions>
{
    public SupportOptions CurrentValue { get; } = new() { RequestsEnabled = enabled };
    public SupportOptions Get(string? name) => CurrentValue;
    public IDisposable? OnChange(Action<SupportOptions, string?> listener) => null;
}
