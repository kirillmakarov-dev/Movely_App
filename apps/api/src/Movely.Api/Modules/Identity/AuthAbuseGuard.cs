using System.Collections.Concurrent;
using Movely.Api.Shared.Errors;
using Movely.Api.Shared.Time;

namespace Movely.Api.Modules.Identity;

public interface IAuthAbuseGuard
{
    Task EnsureOtpRequestAllowedAsync(string normalizedPhone, string? clientIp, CancellationToken cancellationToken = default);
    Task EnsureOtpVerificationAllowedAsync(string normalizedPhone, string? clientIp, CancellationToken cancellationToken = default);
}

public sealed class AuthAbuseGuard : IAuthAbuseGuard
{
    private readonly IClock _clock;
    private readonly ConcurrentDictionary<string, WindowCounter> _counters = new();

    private static readonly TimeSpan RequestWindow = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan VerificationWindow = TimeSpan.FromMinutes(10);
    private const int RequestLimit = 3;
    private const int VerificationLimit = 4;

    public AuthAbuseGuard(IClock clock)
    {
        _clock = clock;
    }

    public Task EnsureOtpRequestAllowedAsync(string normalizedPhone, string? clientIp, CancellationToken cancellationToken = default)
    {
        EnsureAllowed(BuildKey("otp-request", normalizedPhone, clientIp), RequestWindow, RequestLimit);
        return Task.CompletedTask;
    }

    public Task EnsureOtpVerificationAllowedAsync(string normalizedPhone, string? clientIp, CancellationToken cancellationToken = default)
    {
        EnsureAllowed(BuildKey("otp-verify", normalizedPhone, clientIp), VerificationWindow, VerificationLimit);
        return Task.CompletedTask;
    }

    private void EnsureAllowed(string key, TimeSpan window, int limit)
    {
        var now = _clock.UtcNow;
        var counter = _counters.AddOrUpdate(
            key,
            _ => new WindowCounter(1, now.Add(window)),
            (_, existing) =>
            {
                if (existing.ResetAt <= now)
                {
                    return new WindowCounter(1, now.Add(window));
                }

                return existing with { Count = existing.Count + 1 };
            });

        if (counter.Count > limit)
        {
            throw new ApiException("RATE_LIMITED", "Too many authentication attempts.", 429);
        }
    }

    private static string BuildKey(string prefix, string normalizedPhone, string? clientIp)
        => $"{prefix}:{normalizedPhone}:{clientIp ?? "unknown"}";

    private sealed record WindowCounter(int Count, DateTimeOffset ResetAt);
}
