namespace Movely.Api.Modules.MoveRequests;

using Movely.Api.Data;

public sealed record CreateMoveRequestRequest(MoveRequestType RequestType);

public sealed record UpdateMoveRequestRequest(
    MoveRequestType RequestType,
    MoveLocationDto? Pickup,
    MoveLocationDto? Destination,
    ApartmentMoveDetailsDto? ApartmentMove,
    IReadOnlyList<MoveItemDto>? SmallMoveItems,
    IReadOnlyList<MoveItemDto>? SpecialItems,
    MoveScheduleDto? Schedule,
    MoveBudgetBand? BudgetBand,
    string? CustomerComment,
    IReadOnlyList<MovePhotoDto>? Photos);

public sealed record MoveLocationDto(
    string? City,
    string? ExactAddress,
    int? Floor,
    bool? HasElevator,
    ElevatorFurnitureSuitability ElevatorFurnitureSuitability,
    string? StairsInfo,
    string? TruckAccessInfo,
    int? ParkingDistanceMeters);

public sealed record ApartmentMoveDetailsDto(
    int? NumberOfRooms,
    BoxCountsDto Boxes,
    IReadOnlyList<MoveItemDto>? InventoryItems,
    AdditionalServicesDto AdditionalServices);

public sealed record BoxCountsDto(int Small, int Medium, int Large);

public sealed record AdditionalServicesDto(
    bool FurnitureDisassembly,
    bool FurnitureAssembly,
    bool PackingAssistance,
    bool PackingMaterials);

public sealed record MoveItemDto(
    MoveItemKind Kind,
    ApartmentInventoryItemType? ApartmentInventoryType,
    SpecialItemType? SpecialItemType,
    SmallMoveItemCategory? SmallMoveCategory,
    string? Name,
    string? Description,
    int Quantity,
    decimal? LengthCm,
    decimal? WidthCm,
    decimal? HeightCm,
    decimal? ApproximateWeightKg);

public sealed record MoveScheduleDto(
    DateOnly? MoveDate,
    PreferredMoveTime? PreferredTime,
    MoveDateFlexibility? DateFlexibility);

public sealed record MovePhotoDto(
    string ObjectKey,
    string? OriginalFileName,
    string ContentType,
    long SizeBytes,
    int DisplayOrder);

public sealed record MoveRequestResponse(
    Guid Id,
    Guid CustomerUserId,
    MoveRequestType RequestType,
    MoveRequestStatus Status,
    LeadSalesStatus LeadSalesStatus,
    bool DuplicateRisk,
    MoneyDto LeadPrice,
    int MaxLeadBuyers,
    int ActiveBuyerCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? PublishedAt,
    DateTimeOffset? ClosedAt,
    DateTimeOffset? CancelledAt,
    DateTimeOffset? ExpiredAt,
    MoveRequestVersionResponse? CurrentVersion);

public sealed record MoveRequestSummaryResponse(
    Guid Id,
    MoveRequestType RequestType,
    MoveRequestStatus Status,
    LeadSalesStatus LeadSalesStatus,
    bool DuplicateRisk,
    MoneyDto LeadPrice,
    int MaxLeadBuyers,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? PublishedAt,
    int? CurrentVersionNumber);

public sealed record MoveRequestVersionResponse(
    Guid Id,
    Guid MoveRequestId,
    int VersionNumber,
    Guid CreatedByUserId,
    DateTimeOffset CreatedAt,
    MoveRequestType RequestType,
    MoveLocationDto? Pickup,
    MoveLocationDto? Destination,
    ApartmentMoveDetailsDto? ApartmentMove,
    IReadOnlyList<MoveItemDto> SmallMoveItems,
    IReadOnlyList<MoveItemDto> SpecialItems,
    MoveScheduleDto Schedule,
    MoveBudgetBand? BudgetBand,
    string? CustomerComment,
    IReadOnlyList<MovePhotoDto> Photos);

public sealed record PublishMoveRequestResponse(
    MoveRequestResponse MoveRequest,
    bool PotentialDuplicateExists);

public sealed record MoneyDto(string Currency, int AmountMinor);
