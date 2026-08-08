using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Shared.Time;
using Microsoft.Extensions.Options;

namespace Movely.Api.Infrastructure.Authentication;

public sealed class SessionAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    private readonly MovelyDbContext _dbContext;
    private readonly IClock _clock;

    public SessionAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        MovelyDbContext dbContext,
        IClock clock)
        : base(options, logger, encoder)
    {
        _dbContext = dbContext;
        _clock = clock;
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Cookies.TryGetValue(AuthenticationConstants.SessionCookieName, out var token) ||
            string.IsNullOrWhiteSpace(token))
        {
            return AuthenticateResult.NoResult();
        }

        var tokenHash = SecurityTokenHasher.HashToken(token);
        var session = await _dbContext.UserSessions
            .Include(x => x.User)
            .ThenInclude(x => x!.OwnedBusinesses)
            .ThenInclude(x => x.Subscription)
            .SingleOrDefaultAsync(x => x.SessionTokenHash == tokenHash, Context.RequestAborted);

        if (session is null || session.RevokedAt is not null || session.ExpiresAt <= _clock.UtcNow)
        {
            return AuthenticateResult.Fail("Invalid or expired session.");
        }

        var user = session.User;
        if (user is null || user.Status == UserStatus.Suspended)
        {
            return AuthenticateResult.Fail("Invalid or suspended user.");
        }

        var business = user.OwnedBusinesses.FirstOrDefault();
        session.LastSeenAt = _clock.UtcNow;
        await _dbContext.SaveChangesAsync(Context.RequestAborted);
        var claims = BuildClaimsPrincipal(session.Id, user, business);
        return AuthenticateResult.Success(new AuthenticationTicket(claims, AuthenticationConstants.Scheme));
    }

    private static ClaimsPrincipal BuildClaimsPrincipal(Guid sessionId, MovelyUser user, Business? business)
    {
        var claims = new List<Claim>
        {
            new("movely_user_id", user.Id.ToString()),
            new("movely_session_id", sessionId.ToString()),
            new(ClaimTypes.GivenName, user.FirstName),
            new(ClaimTypes.Surname, user.LastName),
            new(ClaimTypes.Email, user.Email ?? string.Empty),
            new("phone_number", user.Phone ?? string.Empty),
            new("phone_verified", user.PhoneVerified ? bool.TrueString : bool.FalseString),
            new(ClaimTypes.Role, user.Role.ToString())
        };

        if (business is not null)
        {
            claims.Add(new Claim("business_id", business.Id.ToString()));
            claims.Add(new Claim("business_status", business.Status.ToString()));
            if (business.Subscription is not null)
            {
                claims.Add(new Claim("subscription_status", business.Subscription.Status.ToString()));
            }
            else
            {
                claims.Add(new Claim("subscription_status", SubscriptionStatus.Inactive.ToString()));
            }
        }
        else
        {
            claims.Add(new Claim("subscription_status", SubscriptionStatus.Inactive.ToString()));
        }

        var identity = new ClaimsIdentity(claims, AuthenticationConstants.Scheme, ClaimTypes.Name, ClaimTypes.Role);
        return new ClaimsPrincipal(identity);
    }
}
