using Movely.Api.Modules.Localities;
using Movely.Api.Shared.Authorization;
using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace Movely.Api.Modules.Marketplace;

public static class MarketplaceModule
{
    public static IServiceCollection AddMarketplaceModule(this IServiceCollection services)
    {
        services.AddScoped<IMarketplaceService, MarketplaceService>();
        services.AddRateLimiter(options => {
            options.AddPolicy("MarketplaceRead", context => RateLimitPartition.GetFixedWindowLimiter(
                context.User.Identity?.IsAuthenticated == true ? context.User.FindFirst("movely_user_id")?.Value ?? "anonymous" : "anonymous",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 60, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true }));
            options.OnRejected = async (context, ct) => {
                var seconds = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var delay) ? Math.Max(1, (int)Math.Ceiling(delay.TotalSeconds)) : 60;
                context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
                context.HttpContext.Response.Headers.RetryAfter = seconds.ToString(CultureInfo.InvariantCulture);
                await context.HttpContext.Response.WriteAsJsonAsync(new { errorCode = "RATE_LIMITED", message = "Too many marketplace requests. Try again shortly." }, ct);
            };
        });
        return services;
    }

    public static IEndpointRouteBuilder MapMarketplaceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/marketplace/requests").RequireAuthorization(AuthorizationExtensions.VerifiedMover).RequireRateLimiting("MarketplaceRead");
        group.MapGet("/", async (HttpRequest request, ILocalityCatalog localities, IMarketplaceService marketplace, CancellationToken ct)
            => Results.Ok(await marketplace.ListAsync(MarketplaceSearch.Parse(request.Query, localities), ct)));
        group.MapGet("/{requestId:guid}", async (Guid requestId, IMarketplaceService marketplace, CancellationToken ct)
            => Results.Ok(await marketplace.GetAsync(requestId, ct)));
        return app;
    }
}
