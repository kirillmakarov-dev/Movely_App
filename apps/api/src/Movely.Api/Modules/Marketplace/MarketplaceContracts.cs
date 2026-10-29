using System.Globalization;
using Movely.Api.Data;
using Movely.Api.Modules.Localities;
using Movely.Api.Shared.Errors;

namespace Movely.Api.Modules.Marketplace;

public record MarketplaceCardDto
{
    public Guid Id { get; init; }
    public MoveRequestType RequestType { get; init; }
    public LocalityDto? PickupCity { get; init; }
    public LocalityDto? DestinationCity { get; init; }
    public DateOnly? MoveDate { get; init; }
    public DateTimeOffset PublishedAt { get; init; }
    public MoveBudgetBand? BudgetBand { get; init; }
    public int? NumberOfRooms { get; init; }
    public long BoxCount { get; init; }
    public long ItemCount { get; init; }
    public LeadSalesStatus LeadSalesStatus { get; init; }
}

public sealed record MarketplaceDetailDto : MarketplaceCardDto
{
    public MarketplaceAccessDto? PickupAccess { get; init; }
    public MarketplaceAccessDto? DestinationAccess { get; init; }
    public PreferredMoveTime? PreferredTime { get; init; }
    public MoveDateFlexibility? DateFlexibility { get; init; }
    public IReadOnlyList<MarketplaceItemDto> Items { get; init; } = [];
    public MarketplaceServicesDto Services { get; init; } = new(false, false, false, false);
}

public sealed record MarketplaceAccessDto(int? Floor, bool? HasElevator, ElevatorFurnitureSuitability ElevatorFurnitureSuitability, int? ParkingDistanceMeters);
public sealed record MarketplaceItemDto(MoveItemKind Kind, ApartmentInventoryItemType? ApartmentInventoryType,
    SpecialItemType? SpecialItemType, SmallMoveItemCategory? SmallMoveCategory, int Quantity,
    decimal? LengthCm, decimal? WidthCm, decimal? HeightCm, decimal? ApproximateWeightKg);
public sealed record MarketplaceServicesDto(bool FurnitureDisassembly, bool FurnitureAssembly, bool PackingAssistance, bool PackingMaterials);
public sealed record MarketplacePageDto(IReadOnlyList<MarketplaceCardDto> Items, int Page, int PageSize, int TotalCount);
public enum MarketplaceSort { Newest, MoveDate }

public sealed record MarketplaceSearch(MoveRequestType? RequestType, string? PickupCityCode, string? DestinationCityCode,
    DateOnly? MoveDate, MoveBudgetBand? BudgetBand, MarketplaceSort Sort, int Page, int PageSize)
{
    public static MarketplaceSearch Parse(IQueryCollection query, ILocalityCatalog localities)
    {
        string? Value(string key)
        {
            if (!query.TryGetValue(key, out var value)) return null;
            if (value.Count != 1 || string.IsNullOrEmpty(value[0])) throw Invalid(key);
            return value[0];
        }
        string? City(string key)
        {
            var value = Value(key);
            if (value is not null && localities.FindByCode(value) is null) throw Invalid(key);
            return value;
        }
        int Number(string key, int fallback, int max)
        {
            var value = Value(key);
            if (value is null) return fallback;
            if (!int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var number) || number < 1 || number > max) throw Invalid(key);
            return number;
        }
        var page = Number("page", 1, int.MaxValue);
        var pageSize = Number("pageSize", 12, 50);
        if ((long)(page - 1) * pageSize > int.MaxValue) throw Invalid("page");
        DateOnly? date = null;
        if (Value("moveDate") is { } rawDate)
        {
            if (!DateOnly.TryParseExact(rawDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)) throw Invalid("moveDate");
            date = parsed;
        }
        return new(ParseEnum<MoveRequestType>(Value("requestType"), "requestType"), City("pickupCityCode"), City("destinationCityCode"), date,
            ParseEnum<MoveBudgetBand>(Value("budgetBand"), "budgetBand"), ParseEnum<MarketplaceSort>(Value("sort"), "sort") ?? MarketplaceSort.Newest, page, pageSize);
    }

    private static T? ParseEnum<T>(string? value, string field) where T : struct, Enum
        => value is null ? null : Enum.TryParse<T>(value, out var result) && Enum.IsDefined(result) && result.ToString() == value ? result : throw Invalid(field);
    private static ApiException Invalid(string field) => new("INVALID_MARKETPLACE_FILTER", $"The {field} filter is invalid.");
}
