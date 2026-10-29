using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using Movely.Api.Shared.Authorization;
using Movely.Api.Shared.Errors;

namespace Movely.Api.Modules.Support;

public static class SupportModule
{
    public static IServiceCollection AddSupportModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<SupportOptions>(configuration.GetSection("Support"));
        services.AddScoped<ISupportRequestService, SupportRequestService>();
        services.AddSingleton<IStartupFilter, SupportBodyLimitStartupFilter>();
        services.AddRateLimiter(options => {
            Add("SupportRead", 60, TimeSpan.FromMinutes(1));
            Add("SupportCreate", 5, TimeSpan.FromMinutes(5));
            Add("SupportCommand", 10, TimeSpan.FromMinutes(5));
            Add("AdminSupportCommand", 30, TimeSpan.FromMinutes(1));
            void Add(string name, int limit, TimeSpan window) => options.AddPolicy(name, context => RateLimitPartition.GetFixedWindowLimiter(
                context.User.Identity?.IsAuthenticated == true ? context.User.FindFirst("movely_user_id")?.Value ?? "anonymous" : "anonymous",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = limit, Window = window, QueueLimit = 0, AutoReplenishment = true }));
        });
        return services;
    }
    public static IEndpointRouteBuilder MapSupportEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/support/capabilities", (IOptionsMonitor<SupportOptions> options) => Results.Ok(new SupportCapabilitiesDto(options.CurrentValue.RequestsEnabled)));
        var owner = app.MapGroup("/api/v1/support/requests").RequireAuthorization(AuthorizationExtensions.CustomerOrMover);
        owner.MapPost("/", async (CreateSupportRequest request, ICurrentUser user, ISupportRequestService service, CancellationToken ct) => {
            var result = await service.CreateAsync(Id(user), request, ct);
            return result.AlreadyCreated ? Results.Ok(result) : Results.Created($"/api/v1/support/requests/{result.Request.Id}", result);
        }).RequireRateLimiting("SupportCreate");
        owner.MapGet("/", async (HttpRequest request, ICurrentUser user, ISupportRequestService service, CancellationToken ct)
            => Results.Ok(await service.ListOwnedAsync(Id(user), SupportRequestQuery.Parse(request.Query), ct))).RequireRateLimiting("SupportRead");
        owner.MapGet("/by-client-mutation/{clientMutationId:guid}", async (Guid clientMutationId, ICurrentUser user, ISupportRequestService service, CancellationToken ct)
            => Results.Ok(await service.FindSubmissionAsync(Id(user), clientMutationId, ct))).RequireRateLimiting("SupportRead");
        owner.MapGet("/{requestId:guid}", async (Guid requestId, HttpRequest request, ICurrentUser user, ISupportRequestService service, CancellationToken ct)
            => Results.Ok(await service.GetOwnedAsync(Id(user), requestId, SupportRequestQuery.Parse(request.Query, true), ct))).RequireRateLimiting("SupportRead");
        owner.MapPost("/{requestId:guid}/replies", async (Guid requestId, SupportReplyRequest request, ICurrentUser user, ISupportRequestService service, CancellationToken ct)
            => Results.Ok(await service.ReplyOwnedAsync(Id(user), requestId, request, ct))).RequireRateLimiting("SupportCommand");
        owner.MapPost("/{requestId:guid}/cancel", async (Guid requestId, SupportCancelRequest request, ICurrentUser user, ISupportRequestService service, CancellationToken ct)
            => Results.Ok(await service.CancelOwnedAsync(Id(user), requestId, request, ct))).RequireRateLimiting("SupportCommand");
        var admin = app.MapGroup("/api/v1/admin/support/requests").RequireAuthorization(AuthorizationExtensions.AdminOnly);
        admin.MapGet("/", async (HttpRequest request, ICurrentUser user, ISupportRequestService service, CancellationToken ct)
            => Results.Ok(await service.ListAdminAsync(Id(user), SupportRequestQuery.Parse(request.Query), ct))).RequireRateLimiting("SupportRead");
        admin.MapGet("/{requestId:guid}", async (Guid requestId, HttpRequest request, ICurrentUser user, ISupportRequestService service, CancellationToken ct)
            => Results.Ok(await service.GetAdminAsync(Id(user), requestId, SupportRequestQuery.Parse(request.Query, true), ct))).RequireRateLimiting("SupportRead");
        admin.MapPost("/{requestId:guid}/replies", async (Guid requestId, AdminSupportReplyRequest request, ICurrentUser user, ISupportRequestService service, CancellationToken ct)
            => Results.Ok(await service.ReplyAdminAsync(Id(user), requestId, request, ct))).RequireRateLimiting("AdminSupportCommand");
        admin.MapPost("/{requestId:guid}/status", async (Guid requestId, AdminSupportStatusRequest request, ICurrentUser user, ISupportRequestService service, CancellationToken ct)
            => Results.Ok(await service.SetStatusAdminAsync(Id(user), requestId, request, ct))).RequireRateLimiting("AdminSupportCommand");
        return app;
    }
    private static Guid Id(ICurrentUser user) => user.UserId ?? throw new ApiException("AUTHENTICATION_REQUIRED", "Sign in to continue.", 401);
}

// Bound the stream before JSON deserialization, including requests without Content-Length.
internal sealed class SupportBodyLimitStartupFilter : IStartupFilter
{
    private const int MaximumBytes = 32768;
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app => {
        app.Use(async (context, continuation) => {
            if (!HttpMethods.IsPost(context.Request.Method) ||
                !(context.Request.Path.StartsWithSegments("/api/v1/support/requests") || context.Request.Path.StartsWithSegments("/api/v1/admin/support/requests"))) {
                await continuation(); return;
            }
            if (context.Request.ContentLength > MaximumBytes) { await Reject(context); return; }
            var original = context.Request.Body;
            using var buffered = new MemoryStream();
            var bytes = new byte[8192];
            int read;
            while ((read = await original.ReadAsync(bytes, context.RequestAborted)) != 0) {
                if (buffered.Length + read > MaximumBytes) { await Reject(context); return; }
                await buffered.WriteAsync(bytes.AsMemory(0, read), context.RequestAborted);
            }
            buffered.Position = 0;
            context.Request.Body = buffered;
            try { await continuation(); }
            finally { context.Request.Body = original; }
        });
        next(app);
    };
    private static async Task Reject(HttpContext context)
    {
        context.Response.StatusCode = 413;
        context.Response.Headers.CacheControl = "no-store";
        await context.Response.WriteAsJsonAsync(new { errorCode = "SUPPORT_PAYLOAD_TOO_LARGE", message = "Support request payload is too large." }, context.RequestAborted);
    }
}
