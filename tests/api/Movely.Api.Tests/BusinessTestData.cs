using Microsoft.EntityFrameworkCore;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Modules.Businesses;
using Movely.Api.Modules.Identity;
using Movely.Api.Modules.Localities;
using Movely.Api.Shared.Time;

namespace Movely.Api.Tests;

internal static class BusinessTestData
{
    private static readonly ILocalityCatalog Catalog = new LocalityCatalog();
    public static BusinessProfileRequest Profile => new("Test Movers", "123456789", "Registered address 12", "Authorized Person", ["5000", "4000"], true);
    public static UpdateBusinessRequest Update(BusinessProfileDto original, bool acknowledge = false) => new("Edited Movers", "123456789", "New registered address 24", "Authorized Person", ["4000"], true, original.RevisionId, acknowledge);
    public static BusinessReviewRequest Review(Guid revision, BusinessReviewDecision decision = BusinessReviewDecision.Verify) => new(revision, decision, "Owner-visible reason", "Registry and representative checked manually", true, true);
    public static BusinessService Service(MovelyDbContext db, IConsentReleaseGate? gate = null) => new(db, new SystemClock(), Catalog, gate ?? new AllowLegal());
    public static MovelyDbContext Memory() => new(new DbContextOptionsBuilder<MovelyDbContext>().UseInMemoryDatabase($"business-{Guid.NewGuid():N}").Options);
    public static async Task<MovelyUser> User(MovelyDbContext db, UserRole role = UserRole.Customer, bool phone = true, bool consent = true)
    {
        var now = DateTimeOffset.UtcNow;
        var user = new MovelyUser { Id = Guid.NewGuid(), Role = role, Status = UserStatus.Active, FirstName = "Account", LastName = "Owner", Email = $"{Guid.NewGuid():N}@example.com", Phone = "+972501234567", PhoneVerified = phone, CreatedAt = now, UpdatedAt = now };
        db.Users.Add(user);
        if (consent) ConsentPolicy.Add(db, user.Id, now);
        await db.SaveChangesAsync();
        return user;
    }
    public sealed class AllowLegal : IConsentReleaseGate { public void EnsureAvailable() { } }
    public sealed class BlockLegal : IConsentReleaseGate
    {
        public void EnsureAvailable() => ConsentPolicy.EnsureAvailable(new Microsoft.Extensions.Hosting.Internal.HostingEnvironment { EnvironmentName = "Production" });
    }
}
