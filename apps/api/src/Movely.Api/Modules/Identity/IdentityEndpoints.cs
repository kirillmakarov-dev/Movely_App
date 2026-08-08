using Microsoft.AspNetCore.Antiforgery;
using Movely.Api.Shared.Authorization;
using Movely.Api.Shared.Errors;

namespace Movely.Api.Modules.Identity;

public static class IdentityEndpoints
{
    public static IEndpointRouteBuilder MapIdentityEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/auth");

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

            var user = await authService.SignInWithGoogleAsync(request.Credential, context, cancellationToken);
            return Results.Ok(user);
        })
        .AllowAnonymous();

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
        .RequireAuthorization(AuthorizationExtensions.CustomerOnly);

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
        .RequireAuthorization(AuthorizationExtensions.CustomerOnly);

        return app;
    }

    public sealed record CsrfResponse(string RequestToken);
}
