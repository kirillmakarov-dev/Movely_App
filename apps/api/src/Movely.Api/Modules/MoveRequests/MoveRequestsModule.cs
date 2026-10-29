using Movely.Api.Shared.Authorization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace Movely.Api.Modules.MoveRequests;

public static class MoveRequestsModule
{
    public static IServiceCollection AddMoveRequestsModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<MoveRequestOptions>(configuration.GetSection("MoveRequests"));
        services.AddScoped<IMoveRequestService, MoveRequestService>();
        services.AddRateLimiter(options => {
            Add("PublicationRead", 60, TimeSpan.FromMinutes(1));
            Add("ContactSharingWrite", 10, TimeSpan.FromMinutes(5));
            void Add(string name, int limit, TimeSpan window) => options.AddPolicy(name, context => RateLimitPartition.GetFixedWindowLimiter(
                context.User.Identity?.IsAuthenticated == true ? context.User.FindFirst("movely_user_id")?.Value ?? "anonymous" : "anonymous",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = limit, Window = window, QueueLimit = 0, AutoReplenishment = true }));
        });
        return services;
    }

    public static IEndpointRouteBuilder MapMoveRequestEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/move-requests")
            .RequireAuthorization(AuthorizationExtensions.CustomerOnly);

        group.MapGet("/{requestId:guid}/publication-status", async (Guid requestId, ICurrentUser user, IMoveRequestService service, CancellationToken ct)
            => user.UserId is { } id ? Results.Ok(await service.GetPublicationStatusAsync(id, requestId, ct)) : Results.Unauthorized())
            .RequireRateLimiting("PublicationRead");
        group.MapPost("/{requestId:guid}/contact-sharing", async (Guid requestId, RenewContactSharingRequest request, ICurrentUser user, IMoveRequestService service, CancellationToken ct)
            => user.UserId is { } id ? Results.Ok(await service.RenewContactSharingAsync(id, requestId, request, ct)) : Results.Unauthorized())
            .RequireRateLimiting("ContactSharingWrite");

        group.MapPost("/", async (
            CreateMoveRequestRequest request,
            ICurrentUser currentUser,
            IMoveRequestService moveRequests,
            CancellationToken cancellationToken) =>
        {
            if (currentUser.UserId is null)
            {
                return Results.Unauthorized();
            }

            var response = await moveRequests.CreateDraftAsync(currentUser.UserId.Value, request, cancellationToken);
            return Results.Created($"/api/v1/move-requests/{response.Id}", response);
        });

        group.MapGet("/{requestId:guid}", async (
            Guid requestId,
            ICurrentUser currentUser,
            IMoveRequestService moveRequests,
            CancellationToken cancellationToken) =>
        {
            if (currentUser.UserId is null)
            {
                return Results.Unauthorized();
            }

            return Results.Ok(await moveRequests.GetOwnedAsync(currentUser.UserId.Value, requestId, cancellationToken));
        });

        group.MapPut("/{requestId:guid}", async (
            Guid requestId,
            UpdateMoveRequestRequest request,
            ICurrentUser currentUser,
            IMoveRequestService moveRequests,
            CancellationToken cancellationToken) =>
        {
            if (currentUser.UserId is null)
            {
                return Results.Unauthorized();
            }

            return Results.Ok(await moveRequests.UpdateOwnedAsync(currentUser.UserId.Value, requestId, request, cancellationToken));
        });

        group.MapPost("/{requestId:guid}/publish", async (
            Guid requestId,
            Movely.Api.Modules.Identity.ContactSharingRequest? acceptance,
            ICurrentUser currentUser,
            IMoveRequestService moveRequests,
            CancellationToken cancellationToken) =>
        {
            if (currentUser.UserId is null)
            {
                return Results.Unauthorized();
            }

            return Results.Ok(await moveRequests.PublishOwnedAsync(currentUser.UserId.Value, requestId, acceptance, cancellationToken));
        });

        group.MapPost("/{requestId:guid}/cancel", async (
            Guid requestId,
            ICurrentUser currentUser,
            IMoveRequestService moveRequests,
            CancellationToken cancellationToken) =>
        {
            if (currentUser.UserId is null)
            {
                return Results.Unauthorized();
            }

            return Results.Ok(await moveRequests.CancelOwnedAsync(currentUser.UserId.Value, requestId, cancellationToken));
        });

        group.MapPost("/{requestId:guid}/close", async (
            Guid requestId,
            ICurrentUser currentUser,
            IMoveRequestService moveRequests,
            CancellationToken cancellationToken) =>
        {
            if (currentUser.UserId is null)
            {
                return Results.Unauthorized();
            }

            return Results.Ok(await moveRequests.CloseOwnedAsync(currentUser.UserId.Value, requestId, cancellationToken));
        });

        group.MapGet("/{requestId:guid}/versions", async (
            Guid requestId,
            ICurrentUser currentUser,
            IMoveRequestService moveRequests,
            CancellationToken cancellationToken) =>
        {
            if (currentUser.UserId is null)
            {
                return Results.Unauthorized();
            }

            return Results.Ok(await moveRequests.ListVersionsAsync(currentUser.UserId.Value, requestId, cancellationToken));
        });

        group.MapGet("/{requestId:guid}/versions/{versionId:guid}", async (
            Guid requestId,
            Guid versionId,
            ICurrentUser currentUser,
            IMoveRequestService moveRequests,
            CancellationToken cancellationToken) =>
        {
            if (currentUser.UserId is null)
            {
                return Results.Unauthorized();
            }

            return Results.Ok(await moveRequests.GetVersionAsync(currentUser.UserId.Value, requestId, versionId, cancellationToken));
        });

        var meGroup = app.MapGroup("/api/v1/me")
            .RequireAuthorization(AuthorizationExtensions.CustomerOnly);

        meGroup.MapGet("/move-requests", async (
            ICurrentUser currentUser,
            IMoveRequestService moveRequests,
            CancellationToken cancellationToken) =>
        {
            if (currentUser.UserId is null)
            {
                return Results.Unauthorized();
            }

            return Results.Ok(await moveRequests.ListOwnedAsync(currentUser.UserId.Value, cancellationToken));
        });

        return app;
    }
}
