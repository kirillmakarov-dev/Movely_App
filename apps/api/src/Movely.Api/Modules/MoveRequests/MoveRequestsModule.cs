using Movely.Api.Shared.Authorization;

namespace Movely.Api.Modules.MoveRequests;

public static class MoveRequestsModule
{
    public static IServiceCollection AddMoveRequestsModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<MoveRequestOptions>(configuration.GetSection("MoveRequests"));
        services.AddScoped<IMoveRequestService, MoveRequestService>();
        return services;
    }

    public static IEndpointRouteBuilder MapMoveRequestEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/move-requests")
            .RequireAuthorization(AuthorizationExtensions.CustomerOnly);

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
            ICurrentUser currentUser,
            IMoveRequestService moveRequests,
            CancellationToken cancellationToken) =>
        {
            if (currentUser.UserId is null)
            {
                return Results.Unauthorized();
            }

            return Results.Ok(await moveRequests.PublishOwnedAsync(currentUser.UserId.Value, requestId, cancellationToken));
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
