using Microsoft.AspNetCore.Authorization;
using Movely.Api.Data;

namespace Movely.Api.Shared.Authorization;

public static class AuthorizationExtensions
{
    public const string AuthenticatedUser = "AuthenticatedUser";
    public const string CustomerOnly = "CustomerOnly";
    public const string MoverOnly = "MoverOnly";
    public const string AdminOnly = "AdminOnly";
    public const string VerifiedMover = "VerifiedMover";
    public const string VerifiedPhoneCustomer = "VerifiedPhoneCustomer";
    public const string PremiumVerifiedMover = "PremiumVerifiedMover";

    public static IServiceCollection AddMovelyAuthorization(this IServiceCollection services)
    {
        services.AddAuthorization(options =>
        {
            options.AddPolicy(AuthenticatedUser, policy => policy.RequireAuthenticatedUser());
            options.AddPolicy(CustomerOnly, policy => policy.RequireRole(UserRole.Customer.ToString()));
            options.AddPolicy(MoverOnly, policy => policy.RequireRole(UserRole.Mover.ToString()));
            options.AddPolicy(AdminOnly, policy => policy.RequireRole(UserRole.Admin.ToString()));
            options.AddPolicy(VerifiedPhoneCustomer, policy =>
            {
                policy.RequireRole(UserRole.Customer.ToString());
                policy.RequireClaim("phone_verified", bool.TrueString);
            });
            options.AddPolicy(VerifiedMover, policy =>
            {
                policy.RequireRole(UserRole.Mover.ToString());
                policy.RequireClaim("business_status", BusinessStatus.Verified.ToString());
            });
            options.AddPolicy(PremiumVerifiedMover, policy =>
            {
                policy.RequireRole(UserRole.Mover.ToString());
                policy.RequireClaim("business_status", BusinessStatus.Verified.ToString());
                policy.RequireClaim("subscription_status", SubscriptionStatus.Active.ToString());
            });
        });

        return services;
    }
}

