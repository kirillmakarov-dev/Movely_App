using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Modules.Identity;
using Movely.Api.Modules.Localities;
using Movely.Api.Shared.Errors;
using Movely.Api.Shared.Authorization;
using Movely.Api.Shared.Time;

namespace Movely.Api.Modules.Marketplace;

public interface IMarketplaceService
{
    Task<MarketplacePageDto> ListAsync(MarketplaceSearch search, CancellationToken ct = default);
    Task<MarketplaceDetailDto> GetAsync(Guid requestId, CancellationToken ct = default);
}

public sealed class MarketplaceService(MovelyDbContext db, IClock clock, IConsentReleaseGate legalGate, ILocalityCatalog localities, ICurrentUser currentUser) : IMarketplaceService
{
    public async Task<MarketplacePageDto> ListAsync(MarketplaceSearch search, CancellationToken ct = default)
    {
        await EnsureViewerAsync(ct);
        var query = Eligible();
        if (search.RequestType is { } type) query = query.Where(x => x.RequestType == type);
        if (search.PickupCityCode is { } pickup) query = query.Where(x => x.CurrentVersion!.Locations.Any(l => l.LocationType == MoveLocationType.Pickup && l.CanonicalLocalityCode == pickup));
        if (search.DestinationCityCode is { } destination) query = query.Where(x => x.CurrentVersion!.Locations.Any(l => l.LocationType == MoveLocationType.Destination && l.CanonicalLocalityCode == destination));
        if (search.MoveDate is { } date) query = query.Where(x => x.CurrentVersion!.MoveDate == date);
        if (search.BudgetBand is { } budget) query = query.Where(x => x.CurrentVersion!.BudgetBand == budget);
        var total = await query.CountAsync(ct);
        var ordered = search.Sort == MarketplaceSort.MoveDate
            ? query.OrderBy(x => x.CurrentVersion!.MoveDate).ThenBy(x => x.Id)
            : query.OrderByDescending(x => x.PublishedAt).ThenBy(x => x.Id);
        var rows = await ordered.Skip((search.Page - 1) * search.PageSize).Take(search.PageSize).Select(CardProjection).ToListAsync(ct);
        return new(rows.Select(MapCard<MarketplaceCardDto>).ToList(), search.Page, search.PageSize, total);
    }

    public async Task<MarketplaceDetailDto> GetAsync(Guid requestId, CancellationToken ct = default)
    {
        await EnsureViewerAsync(ct);
        var row = await DetailRows(requestId).SingleOrDefaultAsync(ct);
        if (row is null) throw new ApiException("MARKETPLACE_REQUEST_NOT_FOUND", "The request is not available in the marketplace.", StatusCodes.Status404NotFound);
        return MapCard<MarketplaceDetailDto>(row) with {
            PickupAccess = row.PickupAccess, DestinationAccess = row.DestinationAccess,
            PreferredTime = row.PreferredTime, DateFlexibility = row.DateFlexibility,
            Items = row.Items, Services = row.Services,
        };
    }

    private IQueryable<MarketplaceRow> DetailRows(Guid requestId)
        => Eligible().Where(x => x.Id == requestId).Select(x => new MarketplaceRow {
            Id = x.Id, RequestType = x.RequestType, PublishedAt = x.PublishedAt!.Value,
            PickupCode = x.CurrentVersion!.Locations.Where(l => l.LocationType == MoveLocationType.Pickup).Select(l => l.CanonicalLocalityCode).FirstOrDefault(),
            DestinationCode = x.CurrentVersion.Locations.Where(l => l.LocationType == MoveLocationType.Destination).Select(l => l.CanonicalLocalityCode).FirstOrDefault(),
            MoveDate = x.CurrentVersion.MoveDate, BudgetBand = x.CurrentVersion.BudgetBand,
            NumberOfRooms = x.RequestType == MoveRequestType.ApartmentMove ? x.CurrentVersion.NumberOfRooms : null,
            BoxCount = (long)x.CurrentVersion.SmallBoxCount + x.CurrentVersion.MediumBoxCount + x.CurrentVersion.LargeBoxCount,
            ItemCount = x.CurrentVersion.Items.Sum(i => (long?)i.Quantity) ?? 0,
            LeadSalesStatus = x.ActiveBuyerCount >= x.MaxLeadBuyers ? LeadSalesStatus.SoldOut : x.LeadSalesStatus,
            PickupAccess = x.CurrentVersion.Locations.Where(l => l.LocationType == MoveLocationType.Pickup)
                .Select(l => new MarketplaceAccessDto(l.Floor, l.HasElevator, l.ElevatorFurnitureSuitability, l.ParkingDistanceMeters)).FirstOrDefault(),
            DestinationAccess = x.CurrentVersion.Locations.Where(l => l.LocationType == MoveLocationType.Destination)
                .Select(l => new MarketplaceAccessDto(l.Floor, l.HasElevator, l.ElevatorFurnitureSuitability, l.ParkingDistanceMeters)).FirstOrDefault(),
            PreferredTime = x.CurrentVersion.PreferredTime, DateFlexibility = x.CurrentVersion.DateFlexibility,
            Items = x.CurrentVersion.Items.OrderBy(i => i.Kind).ThenBy(i => i.Id).Select(i => new MarketplaceItemDto(
                i.Kind, i.ApartmentInventoryType, i.SpecialItemType, i.SmallMoveCategory, i.Quantity,
                i.LengthCm, i.WidthCm, i.HeightCm, i.ApproximateWeightKg)).ToList(),
            Services = new MarketplaceServicesDto(x.CurrentVersion.FurnitureDisassembly, x.CurrentVersion.FurnitureAssembly,
                x.CurrentVersion.PackingAssistance, x.CurrentVersion.PackingMaterials),
        });

    private async Task EnsureViewerAsync(CancellationToken ct)
    {
        legalGate.EnsureAvailable();
        if (currentUser.UserId is not { } viewerId || !await ConsentPolicy.HasCurrentAsync(db, viewerId, ct))
            throw new ApiException("POLICY_ACCEPTANCE_REQUIRED", "Accept the current policies before viewing marketplace requests.", StatusCodes.Status403Forbidden);
    }

    private IQueryable<MoveRequest> Eligible()
        => Movely.Api.Modules.MoveRequests.RequestPublicationEligibility.Eligible(db, BusinessCalendar.Today(clock.UtcNow));

    // Dedicated SQL projection: private strings occur only in eligibility predicates, never in returned columns.
    private static readonly Expression<Func<MoveRequest, MarketplaceRow>> CardProjection = x => new MarketplaceRow {
        Id = x.Id, RequestType = x.RequestType, PublishedAt = x.PublishedAt!.Value,
        PickupCode = x.CurrentVersion!.Locations.Where(l => l.LocationType == MoveLocationType.Pickup).Select(l => l.CanonicalLocalityCode).FirstOrDefault(),
        DestinationCode = x.CurrentVersion.Locations.Where(l => l.LocationType == MoveLocationType.Destination).Select(l => l.CanonicalLocalityCode).FirstOrDefault(),
        MoveDate = x.CurrentVersion.MoveDate, BudgetBand = x.CurrentVersion.BudgetBand,
        NumberOfRooms = x.RequestType == MoveRequestType.ApartmentMove ? x.CurrentVersion.NumberOfRooms : null,
        BoxCount = (long)x.CurrentVersion.SmallBoxCount + x.CurrentVersion.MediumBoxCount + x.CurrentVersion.LargeBoxCount,
        ItemCount = x.CurrentVersion.Items.Sum(i => (long?)i.Quantity) ?? 0,
        LeadSalesStatus = x.ActiveBuyerCount >= x.MaxLeadBuyers ? LeadSalesStatus.SoldOut : x.LeadSalesStatus,
    };

    private T MapCard<T>(MarketplaceRow row) where T : MarketplaceCardDto, new() => new() {
        Id = row.Id, RequestType = row.RequestType, PublishedAt = row.PublishedAt,
        PickupCity = row.PickupCode is null ? null : localities.FindByCode(row.PickupCode),
        DestinationCity = row.DestinationCode is null ? null : localities.FindByCode(row.DestinationCode),
        MoveDate = row.MoveDate, BudgetBand = row.BudgetBand, NumberOfRooms = row.NumberOfRooms,
        BoxCount = row.BoxCount, ItemCount = row.ItemCount, LeadSalesStatus = row.LeadSalesStatus,
    };

    private sealed class MarketplaceRow
    {
        public Guid Id { get; init; }
        public MoveRequestType RequestType { get; init; }
        public string? PickupCode { get; init; }
        public string? DestinationCode { get; init; }
        public DateOnly? MoveDate { get; init; }
        public DateTimeOffset PublishedAt { get; init; }
        public MoveBudgetBand? BudgetBand { get; init; }
        public int? NumberOfRooms { get; init; }
        public long BoxCount { get; init; }
        public long ItemCount { get; init; }
        public LeadSalesStatus LeadSalesStatus { get; init; }
        public MarketplaceAccessDto? PickupAccess { get; init; }
        public MarketplaceAccessDto? DestinationAccess { get; init; }
        public PreferredMoveTime? PreferredTime { get; init; }
        public MoveDateFlexibility? DateFlexibility { get; init; }
        public List<MarketplaceItemDto> Items { get; init; } = [];
        public MarketplaceServicesDto Services { get; init; } = new(false, false, false, false);
    }
}
