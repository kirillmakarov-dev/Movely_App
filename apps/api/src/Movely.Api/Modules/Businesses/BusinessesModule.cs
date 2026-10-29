using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Movely.Api.Shared.Authorization;
using Movely.Api.Shared.Errors;

namespace Movely.Api.Modules.Businesses;

public static class BusinessesModule
{
    public static IServiceCollection AddBusinessesModule(this IServiceCollection services)
    {
        services.AddScoped<IBusinessService, BusinessService>();
        services.AddRateLimiter(options => {
            Add("BusinessRead", 60, TimeSpan.FromMinutes(1));
            Add("BusinessWrite", 10, TimeSpan.FromMinutes(5));
            Add("AdminBusinessWrite", 30, TimeSpan.FromMinutes(1));
            void Add(string name, int limit, TimeSpan window) => options.AddPolicy(name, context => RateLimitPartition.GetFixedWindowLimiter(
                context.User.Identity?.IsAuthenticated == true ? context.User.FindFirst("movely_user_id")?.Value ?? "anonymous" : "anonymous",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = limit, Window = window, QueueLimit = 0, AutoReplenishment = true }));
        });
        return services;
    }

    public static IEndpointRouteBuilder MapBusinessEndpoints(this IEndpointRouteBuilder app)
    {
        var owner = app.MapGroup("/api/v1/businesses").RequireAuthorization(AuthorizationExtensions.AuthenticatedUser);
        owner.MapPost("/", async (BusinessProfileRequest request, ICurrentUser user, IBusinessService service, CancellationToken ct) => {
            var result = await service.CreateAsync(Id(user), request, ct);
            return Results.Created("/api/v1/businesses/me", result);
        }).RequireRateLimiting("BusinessWrite");
        owner.MapGet("/me", async (ICurrentUser user, IBusinessService service, CancellationToken ct)
            => Results.Ok(await service.GetMineAsync(Id(user), ct))).RequireRateLimiting("BusinessRead");
        owner.MapPatch("/me", async (UpdateBusinessRequest request, ICurrentUser user, IBusinessService service, CancellationToken ct)
            => Results.Ok(await service.UpdateAsync(Id(user), request, ct))).RequireRateLimiting("BusinessWrite");

        var admin = app.MapGroup("/api/v1/admin/businesses").RequireAuthorization(AuthorizationExtensions.AdminOnly);
        admin.MapGet("/", async (HttpRequest request, ICurrentUser user, IBusinessService service, CancellationToken ct)
            => Results.Ok(await service.ListAsync(Id(user), AdminBusinessSearch.Parse(request.Query), ct))).RequireRateLimiting("BusinessRead");
        admin.MapGet("/{businessId:guid}", async (Guid businessId, ICurrentUser user, IBusinessService service, CancellationToken ct)
            => Results.Ok(await service.GetAsync(Id(user), businessId, ct))).RequireRateLimiting("BusinessRead");
        admin.MapPost("/{businessId:guid}/reviews", async (Guid businessId, BusinessReviewRequest request, ICurrentUser user, IBusinessService service, CancellationToken ct)
            => Results.Ok(await service.ReviewAsync(Id(user), businessId, request, ct))).RequireRateLimiting("AdminBusinessWrite");
        return app;
    }
    private static Guid Id(ICurrentUser user) => user.UserId ?? throw new ApiException("AUTHENTICATION_REQUIRED", "Sign in to continue.", 401);
}
