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
    private static readonly PreferredMoveTime[] Times = Enum.GetValues<PreferredMoveTime>();
    private static readonly MoveDateFlexibility[] Flexibilities = Enum.GetValues<MoveDateFlexibility>();
    private static readonly MoveBudgetBand[] Budgets = Enum.GetValues<MoveBudgetBand>();
    private static readonly MoveItemKind[] Kinds = Enum.GetValues<MoveItemKind>();
    private static readonly ApartmentInventoryItemType[] InventoryTypes = Enum.GetValues<ApartmentInventoryItemType>();
    private static readonly SpecialItemType[] SpecialTypes = Enum.GetValues<SpecialItemType>();
    private static readonly SmallMoveItemCategory[] Categories = Enum.GetValues<SmallMoveItemCategory>();
    private static readonly ElevatorFurnitureSuitability[] ElevatorSuitabilities = Enum.GetValues<ElevatorFurnitureSuitability>();
    // Match .NET whitespace semantics; PostgreSQL's default btrim does not remove Unicode whitespace.
    private const string Whitespace = "\t\n\v\f\r \u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000";

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
    {
        var today = BusinessCalendar.Today(clock.UtcNow);
        var version = ConsentPolicy.Version;
        var testOnly = ConsentPolicy.IsDraft;
        return db.MoveRequests.AsNoTracking().Where(x =>
            x.Status == MoveRequestStatus.Active && (x.LeadSalesStatus == LeadSalesStatus.Available || x.LeadSalesStatus == LeadSalesStatus.SoldOut) &&
            x.PublishedAt != null && x.MaxLeadBuyers > 0 && x.ActiveBuyerCount >= 0 &&
            x.CustomerUser != null && x.CustomerUser.Status == UserStatus.Active && x.CustomerUser.Role == UserRole.Customer && x.CustomerUser.PhoneVerified &&
            x.CurrentVersion != null && x.CurrentVersion.MoveRequestId == x.Id && x.CurrentVersion.RequestType == x.RequestType &&
            x.CurrentVersion.MoveDate >= today && x.CurrentVersion.PreferredTime.HasValue && Times.Contains(x.CurrentVersion.PreferredTime.Value) &&
            x.CurrentVersion.DateFlexibility.HasValue && Flexibilities.Contains(x.CurrentVersion.DateFlexibility.Value) &&
            (!x.CurrentVersion.BudgetBand.HasValue || Budgets.Contains(x.CurrentVersion.BudgetBand.Value)) &&
            ((x.RequestType == MoveRequestType.ApartmentMove && x.CurrentVersion.NumberOfRooms >= 1 && x.CurrentVersion.NumberOfRooms <= 20) ||
             (x.RequestType == MoveRequestType.SmallMove && x.CurrentVersion.Items.Any(i => i.Kind == MoveItemKind.SmallMoveItem))) &&
            x.CurrentVersion.SmallBoxCount >= 0 && x.CurrentVersion.MediumBoxCount >= 0 && x.CurrentVersion.LargeBoxCount >= 0 &&
            x.CurrentVersion.Locations.Any(l => l.LocationType == MoveLocationType.Pickup && l.City != null && l.City.Trim(Whitespace.ToCharArray()) != "" && l.ExactAddress != null && l.ExactAddress.Trim(Whitespace.ToCharArray()) != "") &&
            x.CurrentVersion.Locations.Any(l => l.LocationType == MoveLocationType.Destination && l.City != null && l.City.Trim(Whitespace.ToCharArray()) != "" && l.ExactAddress != null && l.ExactAddress.Trim(Whitespace.ToCharArray()) != "") &&
            x.CurrentVersion.Locations.All(l => ElevatorSuitabilities.Contains(l.ElevatorFurnitureSuitability) &&
                (!l.Floor.HasValue || (l.Floor >= -5 && l.Floor <= 200)) && (!l.ParkingDistanceMeters.HasValue || l.ParkingDistanceMeters >= 0)) &&
            x.CurrentVersion.Items.All(i => Kinds.Contains(i.Kind) && i.Quantity > 0 &&
                ((i.Kind == MoveItemKind.ApartmentInventory && i.ApartmentInventoryType.HasValue) ||
                 (i.Kind == MoveItemKind.SmallMoveItem && i.SmallMoveCategory.HasValue) ||
                 (i.Kind == MoveItemKind.SpecialItem && i.SpecialItemType.HasValue)) &&
                (!i.LengthCm.HasValue || i.LengthCm >= 0) && (!i.WidthCm.HasValue || i.WidthCm >= 0) &&
                (!i.HeightCm.HasValue || i.HeightCm >= 0) && (!i.ApproximateWeightKg.HasValue || i.ApproximateWeightKg >= 0) &&
                (!i.ApartmentInventoryType.HasValue || InventoryTypes.Contains(i.ApartmentInventoryType.Value)) &&
                (!i.SpecialItemType.HasValue || SpecialTypes.Contains(i.SpecialItemType.Value)) &&
                (!i.SmallMoveCategory.HasValue || Categories.Contains(i.SmallMoveCategory.Value))) &&
            db.PolicyAcceptances.Any(a => a.UserId == x.CustomerUserId && a.AdultConfirmed && a.TermsVersion == version && a.PrivacyVersion == version && a.IsTestOnly == testOnly) &&
            db.ContactSharingAcceptances.Any(a => a.UserId == x.CustomerUserId && a.MoveRequestId == x.Id && a.RequestVersionId == x.CurrentVersionId &&
                a.DisclosureVersion == version && a.MaxRecipients == x.MaxLeadBuyers && a.IsTestOnly == testOnly));
    }

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
