using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.EntityFrameworkCore;
using Movely.Api.Data;
using Movely.Api.Modules.Identity;
using Movely.Api.Shared.Authorization;
using Movely.Api.Shared.Time;

namespace Movely.Api.Infrastructure.Authentication;

public static class AuthenticationExtensions
{
    public static IServiceCollection AddMovelyAuthentication(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();
        services.AddSingleton<IClock, Movely.Api.Shared.Time.SystemClock>();
        var sessionPepper = configuration["Security:SessionPepper"];
        var otpPepper = configuration["Security:OtpPepper"];
        if (!string.IsNullOrWhiteSpace(sessionPepper) && !string.IsNullOrWhiteSpace(otpPepper))
        {
            SecurityTokenHasher.Configure(sessionPepper, otpPepper);
        }
        services.AddScoped<IGoogleIdentityVerifier>(sp =>
        {
            var options = sp.GetRequiredService<IConfiguration>().GetSection("Auth:Google").Get<GoogleAuthOptions>() ?? new GoogleAuthOptions();
            if (!environment.IsDevelopment() && !environment.IsEnvironment("Testing"))
            {
                return new UnsupportedGoogleIdentityVerifier("Google auth production verifier is not configured yet.");
            }

            return new DevelopmentGoogleIdentityVerifier(options);
        });
        services.AddScoped<ISmsSender>(sp =>
        {
            var options = sp.GetRequiredService<IConfiguration>().GetSection("Sms").Get<SmsOptions>() ?? new SmsOptions();
            if (!environment.IsDevelopment() && !environment.IsEnvironment("Testing"))
            {
                return new UnsupportedSmsSender("SMS provider is not configured yet.");
            }

            return new DevelopmentSmsSender(sp.GetRequiredService<ILogger<DevelopmentSmsSender>>());
        });
        services.AddScoped<ISessionService, SessionService>();
        services.AddSingleton<IAuthAbuseGuard, AuthAbuseGuard>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IPhoneNormalizer, IsraeliPhoneNormalizer>();
        services.AddScoped<IOtpCodeHasher, OtpCodeHasher>();
        services.AddScoped<IGoogleIdentityLinker, GoogleIdentityLinker>();
        services.AddAuthentication(AuthenticationConstants.Scheme)
            .AddScheme<AuthenticationSchemeOptions, SessionAuthenticationHandler>(AuthenticationConstants.Scheme, _ => { });

        services.AddMovelyAuthorization();

        services.AddAntiforgery(options =>
        {
            options.Cookie.Name = AuthenticationConstants.CsrfCookieName;
            options.Cookie.HttpOnly = false;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.HeaderName = "X-CSRF-TOKEN";
        });

        return services;
    }

    public static void UseMovelySecurity(this WebApplication app)
    {
        app.UseAuthentication();
        app.UseAuthorization();
        app.Use(async (context, next) =>
        {
            if (HttpMethods.IsPost(context.Request.Method) ||
                HttpMethods.IsPut(context.Request.Method) ||
                HttpMethods.IsPatch(context.Request.Method) ||
                HttpMethods.IsDelete(context.Request.Method))
            {
                if (!context.Request.Path.StartsWithSegments("/health") &&
                    !context.Request.Path.StartsWithSegments("/api/v1/auth/csrf"))
                {
                    var antiforgery = context.RequestServices.GetRequiredService<IAntiforgery>();
                    try
                    {
                        await antiforgery.ValidateRequestAsync(context);
                    }
                    catch (AntiforgeryValidationException ex)
                    {
                        context.Response.StatusCode = StatusCodes.Status400BadRequest;
                        await context.Response.WriteAsJsonAsync(new
                        {
                            errorCode = "INVALID_CSRF_TOKEN",
                            message = ex.Message,
                            details = Array.Empty<string>(),
                            correlationId = context.TraceIdentifier
                        });
                        return;
                    }
                }
            }

            await next();
        });
    }
}
