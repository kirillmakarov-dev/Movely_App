using Microsoft.AspNetCore.Antiforgery;
using Movely.Api.Infrastructure.Authentication;
using Movely.Api.Shared.Authorization;
using Movely.Api.Shared.Errors;

namespace Movely.Api.Modules.Identity;

public static class IdentityEndpoints
{
    public static IEndpointRouteBuilder MapIdentityEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/auth");

        group.MapGet("/capabilities", (IConfiguration configuration, IHostEnvironment environment, HttpContext context) =>
        {
            var google = configuration.GetSection("Auth:Google").Get<GoogleAuthOptions>() ?? new();
            var policyAvailable = !ConsentPolicy.IsDraft || environment.IsDevelopment() || environment.IsEnvironment("Testing");
            var googleAvailable = google.IsGoogleConfigured;
            context.Response.Headers.CacheControl = "no-store";
            // Development OTP logging does not constitute real SMS delivery.
            return Results.Ok(new AuthCapabilities(policyAvailable, googleAvailable, googleAvailable ? google.ClientId : null, false));
        }).AllowAnonymous();

        group.MapGet("/csrf", (HttpContext context, IAntiforgery antiforgery) =>
        {
            var tokens = antiforgery.GetAndStoreTokens(context);
            return Results.Ok(new CsrfResponse(tokens.RequestToken ?? string.Empty));
        })
        .AllowAnonymous();

        group.MapPost("/google/sign-in", async (
            GoogleSignInRequest request,
            HttpContext context,
            IAuthService authService,
            CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(request.Credential))
            {
                throw new ApiException("INVALID_AUTH_CREDENTIAL", "Google credential is required.");
            }

            var user = await authService.SignInWithGoogleAsync(request.Credential, context, cancellationToken, request.Acceptance);
            return Results.Ok(user);
        })
        .AllowAnonymous();

        group.MapPost("/consents", async (
            PolicyAcceptanceRequest request, ICurrentUser currentUser, Movely.Api.Data.MovelyDbContext db,
            Movely.Api.Shared.Time.IClock clock, IConsentReleaseGate consentReleaseGate, CancellationToken cancellationToken) =>
        {
            if (currentUser.UserId is null) return Results.Unauthorized();
            consentReleaseGate.EnsureAvailable();
            ConsentPolicy.Validate(request);
            if (!await ConsentPolicy.HasCurrentAsync(db, currentUser.UserId.Value, cancellationToken))
            {
                ConsentPolicy.Add(db, currentUser.UserId.Value, clock.UtcNow);
                await db.SaveChangesAsync(cancellationToken);
            }
            return Results.NoContent();
        }).RequireAuthorization(AuthorizationExtensions.AuthenticatedUser);

        group.MapGet("/me", async (
            ICurrentUser currentUser,
            IAuthService authService,
            CancellationToken cancellationToken) =>
        {
            if (!currentUser.IsAuthenticated || currentUser.UserId is null)
            {
                return Results.Unauthorized();
            }

            var user = await authService.GetCurrentUserAsync(currentUser.UserId.Value, cancellationToken);
            return Results.Ok(user);
        })
        .RequireAuthorization(AuthorizationExtensions.AuthenticatedUser);

        group.MapPost("/logout", async (
            HttpContext context,
            IAuthService authService,
            CancellationToken cancellationToken) =>
        {
            await authService.LogoutAsync(context, cancellationToken);
            return Results.NoContent();
        })
        .RequireAuthorization(AuthorizationExtensions.AuthenticatedUser);

        group.MapPost("/phone/request-code", async (
            PhoneRequestCodeRequest request,
            HttpContext context,
            ICurrentUser currentUser,
            IAuthService authService,
            IHostEnvironment environment,
            CancellationToken cancellationToken) =>
        {
            if (currentUser.UserId is null)
            {
                return Results.Unauthorized();
            }

            if (string.IsNullOrWhiteSpace(request.Phone))
            {
                throw new ApiException("INVALID_PHONE_NUMBER", "Phone number is required.");
            }

            var response = await authService.RequestPhoneCodeAsync(
                currentUser.UserId.Value,
                request.Phone,
                environment.IsDevelopment() || environment.IsEnvironment("Testing"),
                cancellationToken);

            return Results.Ok(response);
        })
        .RequireAuthorization(AuthorizationExtensions.CustomerOrMover);

        group.MapPost("/phone/verify-code", async (
            PhoneVerifyCodeRequest request,
            ICurrentUser currentUser,
            IAuthService authService,
            CancellationToken cancellationToken) =>
        {
            if (currentUser.UserId is null)
            {
                return Results.Unauthorized();
            }

            if (string.IsNullOrWhiteSpace(request.Phone) || string.IsNullOrWhiteSpace(request.Code))
            {
                throw new ApiException("INVALID_OTP_PAYLOAD", "Phone number and code are required.");
            }

            var response = await authService.VerifyPhoneCodeAsync(
                currentUser.UserId.Value,
                request.Phone,
                request.Code,
                cancellationToken);

            return Results.Ok(response);
        })
        .RequireAuthorization(AuthorizationExtensions.CustomerOrMover);

        return app;
    }

    public sealed record CsrfResponse(string RequestToken);
}
