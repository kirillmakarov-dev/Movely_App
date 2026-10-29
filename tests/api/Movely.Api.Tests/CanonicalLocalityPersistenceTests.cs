using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Modules.MoveRequests;
using Movely.Api.Modules.Identity;
using Movely.Api.Modules.Localities;
using Movely.Api.Shared.Errors;
using Movely.Api.Shared.Time;

namespace Movely.Api.Tests;

public sealed class CanonicalLocalityPersistenceTests
{
    [Fact]
    public void CanonicalProjectionModelMatchesMigrationSnapshotAndNewestSortIndex()
    {
        using var db = new MovelyDbContext(new DbContextOptionsBuilder<MovelyDbContext>()
            .UseNpgsql("Host=localhost;Database=model_inspection_only").Options);
        Assert.False(db.Database.HasPendingModelChanges());
        var property = db.Model.FindEntityType(typeof(MoveLocation))!.FindProperty(nameof(MoveLocation.CanonicalLocalityCode))!;
        Assert.True(property.IsNullable);
        Assert.Equal(6, property.GetMaxLength());
    }

    [Fact]
    public async Task IsraelMidnightMakesYesterdaysMoveDateInvalidForPublicationAndUpdate()
    {
        await using var db = new MovelyDbContext(new DbContextOptionsBuilder<MovelyDbContext>()
            .UseInMemoryDatabase($"israel-midnight-{Guid.NewGuid():N}").Options);
        var clock = new MutableClock { UtcNow = DateTimeOffset.Parse("2026-07-10T20:59:00Z") };
        var user = new MovelyUser { Id = Guid.NewGuid(), FirstName = "Test", LastName = "Owner", Role = UserRole.Customer, PhoneVerified = true };
        db.Users.Add(user);
        ConsentPolicy.Add(db, user.Id, clock.UtcNow);
        await db.SaveChangesAsync();
        var service = new MoveRequestService(db, clock, Options.Create(new MoveRequestOptions()), new AllowConsentGate(), new LocalityCatalog());
        var draft = await service.CreateDraftAsync(user.Id, new CreateMoveRequestRequest(MoveRequestType.SmallMove));
        var july10 = ActiveRequestTestData.Update() with { Schedule = new MoveScheduleDto(new DateOnly(2026, 7, 10), PreferredMoveTime.Morning, MoveDateFlexibility.Exact) };
        await service.UpdateOwnedAsync(user.Id, draft.Id, july10);
        clock.UtcNow = DateTimeOffset.Parse("2026-07-10T21:00:00Z"); // July 11 in Israel, still July 10 UTC.
        var publicationError = await Assert.ThrowsAsync<ApiException>(() => service.PublishOwnedAsync(user.Id, draft.Id, ConsentFixtures.Sharing));
        Assert.Equal("INVALID_MOVE_DATE", publicationError.ErrorCode);
        var updateError = await Assert.ThrowsAsync<ApiException>(() => service.UpdateOwnedAsync(user.Id, draft.Id, july10));
        Assert.Equal("INVALID_MOVE_DATE", updateError.ErrorCode);
        Assert.Equal(MoveRequestStatus.Draft, (await db.MoveRequests.FindAsync(draft.Id))!.Status);
        Assert.Empty(await db.ContactSharingAcceptances.ToListAsync());
        Assert.Equal(2, await db.MoveRequestVersions.CountAsync());
        await service.UpdateOwnedAsync(user.Id, draft.Id, july10 with {
            Schedule = july10.Schedule! with { MoveDate = new DateOnly(2026, 7, 11) }
        });
        Assert.Equal(3, await db.MoveRequestVersions.CountAsync());
    }

    [Theory]
    [InlineData("  חיפה  ", "4000")]
    [InlineData("hAiFa", "4000")]
    [InlineData("תל  אביב - יפו", "5000")]
    [InlineData("שחר", "7")]
    [InlineData("ABU QUREINAT", null)]
    [InlineData("ZOHAR", null)]
    [InlineData("תל אביב", null)]
    [InlineData("חיפה 0501234567", null)]
    [InlineData("Haifa, private street 14", null)]
    [InlineData("4000", null)]
    [InlineData(null, null)]
    public async Task NewVersionDerivesOnlyCanonicalCodeAndKeepsPrivateCityText(string? rawCity, string? expectedCode)
    {
        await using var db = new MovelyDbContext(new DbContextOptionsBuilder<MovelyDbContext>()
            .UseInMemoryDatabase($"canonical-locality-{Guid.NewGuid():N}").Options);
        var user = new MovelyUser { Id = Guid.NewGuid(), FirstName = "Test", LastName = "Owner", Role = UserRole.Customer };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        var service = ActiveRequestTestData.Service(db);
        var draft = await service.CreateDraftAsync(user.Id, new CreateMoveRequestRequest(MoveRequestType.SmallMove));
        var input = ActiveRequestTestData.Update();
        var saved = await service.UpdateOwnedAsync(user.Id, draft.Id, input with {
            Pickup = input.Pickup! with { City = rawCity }
        });
        var location = await db.MoveLocations.SingleAsync(x => x.MoveRequestVersionId == saved.CurrentVersion!.Id && x.LocationType == MoveLocationType.Pickup);
        Assert.Equal(rawCity?.Trim(), location.City);
        Assert.Equal(expectedCode, location.CanonicalLocalityCode);
        Assert.Equal(rawCity?.Trim(), saved.CurrentVersion!.Pickup!.City);

        // Changing the city creates a new projection without rewriting the historic version.
        var next = await service.UpdateOwnedAsync(user.Id, draft.Id, input with {
            Pickup = input.Pickup! with { City = "Private unknown place" }
        });
        Assert.Equal(expectedCode, (await db.MoveLocations.SingleAsync(x => x.Id == location.Id)).CanonicalLocalityCode);
        Assert.Null((await db.MoveLocations.SingleAsync(x => x.MoveRequestVersionId == next.CurrentVersion!.Id && x.LocationType == MoveLocationType.Pickup)).CanonicalLocalityCode);
    }

    private sealed class MutableClock : IClock { public DateTimeOffset UtcNow { get; set; } }
    private sealed class AllowConsentGate : IConsentReleaseGate { public void EnsureAvailable() { } }
}
