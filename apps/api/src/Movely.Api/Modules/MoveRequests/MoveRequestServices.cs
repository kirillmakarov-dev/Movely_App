namespace Movely.Api.Modules.MoveRequests;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Shared.Errors;
using Movely.Api.Shared.Time;

public interface IMoveRequestService
{
    Task<MoveRequestResponse> CreateDraftAsync(Guid customerUserId, CreateMoveRequestRequest request, CancellationToken cancellationToken = default);
    Task<MoveRequestResponse> GetOwnedAsync(Guid customerUserId, Guid requestId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<MoveRequestSummaryResponse>> ListOwnedAsync(Guid customerUserId, CancellationToken cancellationToken = default);
    Task<MoveRequestResponse> UpdateOwnedAsync(Guid customerUserId, Guid requestId, UpdateMoveRequestRequest request, CancellationToken cancellationToken = default);
    Task<PublishMoveRequestResponse> PublishOwnedAsync(Guid customerUserId, Guid requestId, CancellationToken cancellationToken = default);
    Task<MoveRequestResponse> CancelOwnedAsync(Guid customerUserId, Guid requestId, CancellationToken cancellationToken = default);
    Task<MoveRequestResponse> CloseOwnedAsync(Guid customerUserId, Guid requestId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<MoveRequestVersionResponse>> ListVersionsAsync(Guid customerUserId, Guid requestId, CancellationToken cancellationToken = default);
    Task<MoveRequestVersionResponse> GetVersionAsync(Guid customerUserId, Guid requestId, Guid versionId, CancellationToken cancellationToken = default);
}

public sealed class MoveRequestService : IMoveRequestService
{
    private const string Currency = "ILS";
    private readonly MovelyDbContext _dbContext;
    private readonly IClock _clock;
    private readonly MoveRequestOptions _options;

    public MoveRequestService(MovelyDbContext dbContext, IClock clock, IOptions<MoveRequestOptions> options)
    {
        _dbContext = dbContext;
        _clock = clock;
        _options = options.Value;
    }

    public async Task<MoveRequestResponse> CreateDraftAsync(Guid customerUserId, CreateMoveRequestRequest request, CancellationToken cancellationToken = default)
    {
        var now = _clock.UtcNow;
        var moveRequest = new MoveRequest
        {
            Id = Guid.NewGuid(),
            CustomerUserId = customerUserId,
            RequestType = request.RequestType,
            Status = MoveRequestStatus.Draft,
            LeadSalesStatus = LeadSalesStatus.Closed,
            LeadPriceAgorot = ResolveDefaultLeadPrice(request.RequestType),
            MaxLeadBuyers = _options.DefaultMaxLeadBuyers,
            CreatedAt = now,
            UpdatedAt = now
        };

        var version = new MoveRequestVersion
        {
            Id = Guid.NewGuid(),
            MoveRequestId = moveRequest.Id,
            VersionNumber = 1,
            CreatedByUserId = customerUserId,
            CreatedAt = now,
            RequestType = request.RequestType
        };

        moveRequest.CurrentVersionId = version.Id;
        _dbContext.MoveRequests.Add(moveRequest);
        _dbContext.MoveRequestVersions.Add(version);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Map(moveRequest, version);
    }

    public async Task<MoveRequestResponse> GetOwnedAsync(Guid customerUserId, Guid requestId, CancellationToken cancellationToken = default)
    {
        var moveRequest = await LoadOwnedRequestAsync(customerUserId, requestId, cancellationToken);
        return Map(moveRequest, moveRequest.CurrentVersion);
    }

    public async Task<IReadOnlyList<MoveRequestSummaryResponse>> ListOwnedAsync(Guid customerUserId, CancellationToken cancellationToken = default)
        => await _dbContext.MoveRequests
            .Where(x => x.CustomerUserId == customerUserId)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new MoveRequestSummaryResponse(
                x.Id,
                x.RequestType,
                x.Status,
                x.LeadSalesStatus,
                x.DuplicateRisk,
                new MoneyDto(Currency, x.LeadPriceAgorot),
                x.MaxLeadBuyers,
                x.CreatedAt,
                x.UpdatedAt,
                x.PublishedAt,
                x.CurrentVersion == null ? null : x.CurrentVersion.VersionNumber))
            .ToListAsync(cancellationToken);

    public async Task<MoveRequestResponse> UpdateOwnedAsync(Guid customerUserId, Guid requestId, UpdateMoveRequestRequest request, CancellationToken cancellationToken = default)
    {
        var moveRequest = await LoadOwnedRequestAsync(customerUserId, requestId, cancellationToken);
        EnsureEditable(moveRequest);
        ValidateSnapshot(request, requirePublishCompleteness: false);

        var latestVersion = await _dbContext.MoveRequestVersions
            .Where(x => x.MoveRequestId == moveRequest.Id)
            .MaxAsync(x => x.VersionNumber, cancellationToken);

        var version = BuildVersion(moveRequest.Id, latestVersion + 1, customerUserId, request);
        moveRequest.RequestType = request.RequestType;
        moveRequest.CurrentVersionId = version.Id;
        moveRequest.UpdatedAt = _clock.UtcNow;

        _dbContext.MoveRequestVersions.Add(version);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Map(moveRequest, version);
    }

    public async Task<PublishMoveRequestResponse> PublishOwnedAsync(Guid customerUserId, Guid requestId, CancellationToken cancellationToken = default)
    {
        var moveRequest = await LoadOwnedRequestAsync(customerUserId, requestId, cancellationToken);
        if (moveRequest.Status != MoveRequestStatus.Draft)
        {
            throw new ApiException("INVALID_REQUEST_STATE", "Only draft requests may be published.");
        }

        var user = await _dbContext.Users.SingleAsync(x => x.Id == customerUserId, cancellationToken);
        if (!user.PhoneVerified)
        {
            throw new ApiException(ApiErrorCodes.PhoneNotVerified, "Customer phone must be verified before publishing.");
        }

        if (moveRequest.CurrentVersion is null)
        {
            throw new ApiException("REQUEST_INCOMPLETE", "Request has no content version.");
        }

        ValidateVersionForPublish(moveRequest.CurrentVersion);
        await EnforceActiveRequestLimitAsync(customerUserId, moveRequest.Id, cancellationToken);
        var duplicateRisk = await DetectDuplicateRiskAsync(customerUserId, moveRequest, moveRequest.CurrentVersion, cancellationToken);

        var now = _clock.UtcNow;
        moveRequest.DuplicateRisk = duplicateRisk;
        moveRequest.Status = MoveRequestStatus.Published;
        moveRequest.PublishedAt = now;
        moveRequest.Status = MoveRequestStatus.Active;
        moveRequest.LeadSalesStatus = LeadSalesStatus.Available;
        moveRequest.UpdatedAt = now;

        await _dbContext.SaveChangesAsync(cancellationToken);
        return new PublishMoveRequestResponse(Map(moveRequest, moveRequest.CurrentVersion), duplicateRisk);
    }

    public async Task<MoveRequestResponse> CancelOwnedAsync(Guid customerUserId, Guid requestId, CancellationToken cancellationToken = default)
    {
        var moveRequest = await LoadOwnedRequestAsync(customerUserId, requestId, cancellationToken);
        if (moveRequest.Status is MoveRequestStatus.Cancelled or MoveRequestStatus.Closed or MoveRequestStatus.Expired)
        {
            throw new ApiException("INVALID_REQUEST_STATE", "Request is already terminal.");
        }

        var now = _clock.UtcNow;
        moveRequest.Status = MoveRequestStatus.Cancelled;
        moveRequest.LeadSalesStatus = LeadSalesStatus.Closed;
        moveRequest.CancelledAt = now;
        moveRequest.UpdatedAt = now;
        await _dbContext.SaveChangesAsync(cancellationToken);
        return Map(moveRequest, moveRequest.CurrentVersion);
    }

    public async Task<MoveRequestResponse> CloseOwnedAsync(Guid customerUserId, Guid requestId, CancellationToken cancellationToken = default)
    {
        var moveRequest = await LoadOwnedRequestAsync(customerUserId, requestId, cancellationToken);
        if (moveRequest.Status != MoveRequestStatus.Active)
        {
            throw new ApiException("INVALID_REQUEST_STATE", "Only active requests may be closed.");
        }

        var now = _clock.UtcNow;
        moveRequest.Status = MoveRequestStatus.Closed;
        moveRequest.LeadSalesStatus = LeadSalesStatus.Closed;
        moveRequest.ClosedAt = now;
        moveRequest.UpdatedAt = now;
        await _dbContext.SaveChangesAsync(cancellationToken);
        return Map(moveRequest, moveRequest.CurrentVersion);
    }

    public async Task<IReadOnlyList<MoveRequestVersionResponse>> ListVersionsAsync(Guid customerUserId, Guid requestId, CancellationToken cancellationToken = default)
    {
        await EnsureOwnedExistsAsync(customerUserId, requestId, cancellationToken);
        var versions = await _dbContext.MoveRequestVersions
            .Include(x => x.Locations)
            .Include(x => x.Items)
            .Include(x => x.Photos)
            .Where(x => x.MoveRequestId == requestId)
            .OrderBy(x => x.VersionNumber)
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        return versions.Select(MapVersion).ToList();
    }

    public async Task<MoveRequestVersionResponse> GetVersionAsync(Guid customerUserId, Guid requestId, Guid versionId, CancellationToken cancellationToken = default)
    {
        await EnsureOwnedExistsAsync(customerUserId, requestId, cancellationToken);
        var version = await _dbContext.MoveRequestVersions
            .Include(x => x.Locations)
            .Include(x => x.Items)
            .Include(x => x.Photos)
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.MoveRequestId == requestId && x.Id == versionId, cancellationToken);

        if (version is null)
        {
            throw NotFound();
        }

        return MapVersion(version);
    }

    private async Task<MoveRequest> LoadOwnedRequestAsync(Guid customerUserId, Guid requestId, CancellationToken cancellationToken)
    {
        var moveRequest = await _dbContext.MoveRequests
            .Include(x => x.CurrentVersion)
            .ThenInclude(x => x!.Locations)
            .Include(x => x.CurrentVersion)
            .ThenInclude(x => x!.Items)
            .Include(x => x.CurrentVersion)
            .ThenInclude(x => x!.Photos)
            .SingleOrDefaultAsync(x => x.Id == requestId && x.CustomerUserId == customerUserId, cancellationToken);

        if (moveRequest is null)
        {
            throw NotFound();
        }

        return moveRequest;
    }

    private async Task EnsureOwnedExistsAsync(Guid customerUserId, Guid requestId, CancellationToken cancellationToken)
    {
        var exists = await _dbContext.MoveRequests.AnyAsync(x => x.Id == requestId && x.CustomerUserId == customerUserId, cancellationToken);
        if (!exists)
        {
            throw NotFound();
        }
    }

    private static ApiException NotFound()
        => new("MOVE_REQUEST_NOT_FOUND", "Move request was not found.", StatusCodes.Status404NotFound);

    private static void EnsureEditable(MoveRequest moveRequest)
    {
        if (moveRequest.Status is MoveRequestStatus.Closed or MoveRequestStatus.Cancelled or MoveRequestStatus.Expired)
        {
            throw new ApiException("INVALID_REQUEST_STATE", "Terminal requests cannot be edited.");
        }
    }

    private MoveRequestVersion BuildVersion(Guid moveRequestId, int versionNumber, Guid userId, UpdateMoveRequestRequest request)
    {
        var version = new MoveRequestVersion
        {
            Id = Guid.NewGuid(),
            MoveRequestId = moveRequestId,
            VersionNumber = versionNumber,
            CreatedByUserId = userId,
            CreatedAt = _clock.UtcNow,
            RequestType = request.RequestType,
            MoveDate = request.Schedule?.MoveDate,
            PreferredTime = request.Schedule?.PreferredTime,
            DateFlexibility = request.Schedule?.DateFlexibility,
            BudgetBand = request.BudgetBand,
            CustomerComment = NormalizeOptional(request.CustomerComment, 2000)
        };

        if (request.ApartmentMove is not null)
        {
            version.NumberOfRooms = request.ApartmentMove.NumberOfRooms;
            version.SmallBoxCount = request.ApartmentMove.Boxes.Small;
            version.MediumBoxCount = request.ApartmentMove.Boxes.Medium;
            version.LargeBoxCount = request.ApartmentMove.Boxes.Large;
            version.FurnitureDisassembly = request.ApartmentMove.AdditionalServices.FurnitureDisassembly;
            version.FurnitureAssembly = request.ApartmentMove.AdditionalServices.FurnitureAssembly;
            version.PackingAssistance = request.ApartmentMove.AdditionalServices.PackingAssistance;
            version.PackingMaterials = request.ApartmentMove.AdditionalServices.PackingMaterials;
        }

        AddLocation(version, MoveLocationType.Pickup, request.Pickup);
        AddLocation(version, MoveLocationType.Destination, request.Destination);
        AddItems(version, request.ApartmentMove?.InventoryItems);
        AddItems(version, request.SmallMoveItems);
        AddItems(version, request.SpecialItems);
        AddPhotos(version, request.Photos);

        return version;
    }

    private static void AddLocation(MoveRequestVersion version, MoveLocationType type, MoveLocationDto? location)
    {
        if (location is null)
        {
            return;
        }

        version.Locations.Add(new MoveLocation
        {
            Id = Guid.NewGuid(),
            LocationType = type,
            City = NormalizeOptional(location.City, 120),
            ExactAddress = NormalizeOptional(location.ExactAddress, 300),
            Floor = location.Floor,
            HasElevator = location.HasElevator,
            ElevatorFurnitureSuitability = location.ElevatorFurnitureSuitability,
            StairsInfo = NormalizeOptional(location.StairsInfo, 500),
            TruckAccessInfo = NormalizeOptional(location.TruckAccessInfo, 500),
            ParkingDistanceMeters = location.ParkingDistanceMeters
        });
    }

    private static void AddItems(MoveRequestVersion version, IReadOnlyList<MoveItemDto>? items)
    {
        foreach (var item in items ?? [])
        {
            version.Items.Add(new MoveItem
            {
                Id = Guid.NewGuid(),
                Kind = item.Kind,
                ApartmentInventoryType = item.ApartmentInventoryType,
                SpecialItemType = item.SpecialItemType,
                SmallMoveCategory = item.SmallMoveCategory,
                Name = NormalizeOptional(item.Name, 160),
                Description = NormalizeOptional(item.Description, 500),
                Quantity = item.Quantity,
                LengthCm = item.LengthCm,
                WidthCm = item.WidthCm,
                HeightCm = item.HeightCm,
                ApproximateWeightKg = item.ApproximateWeightKg
            });
        }
    }

    private void AddPhotos(MoveRequestVersion version, IReadOnlyList<MovePhotoDto>? photos)
    {
        foreach (var photo in photos ?? [])
        {
            version.Photos.Add(new MovePhoto
            {
                Id = Guid.NewGuid(),
                ObjectKey = photo.ObjectKey.Trim(),
                OriginalFileName = NormalizeOptional(photo.OriginalFileName, 255),
                ContentType = photo.ContentType.Trim(),
                SizeBytes = photo.SizeBytes,
                DisplayOrder = photo.DisplayOrder,
                CreatedAt = _clock.UtcNow
            });
        }
    }

    private void ValidateSnapshot(UpdateMoveRequestRequest request, bool requirePublishCompleteness)
    {
        ValidateLocation(request.Pickup, requirePublishCompleteness, "pickup");
        ValidateLocation(request.Destination, requirePublishCompleteness, "destination");
        ValidateSchedule(request.Schedule, requirePublishCompleteness);

        if (request.CustomerComment?.Length > 2000)
        {
            throw new ApiException("INVALID_CUSTOMER_COMMENT", "Customer comment must be 2000 characters or fewer.");
        }

        if (request.ApartmentMove is not null)
        {
            ValidateApartmentDetails(request.ApartmentMove, request.RequestType == MoveRequestType.ApartmentMove && requirePublishCompleteness);
        }

        ValidateItems(request.ApartmentMove?.InventoryItems);
        ValidateItems(request.SmallMoveItems);
        ValidateItems(request.SpecialItems);
        ValidatePhotos(request.Photos);
    }

    private void ValidateVersionForPublish(MoveRequestVersion version)
    {
        var dto = MapVersion(version);
        ValidateSnapshot(new UpdateMoveRequestRequest(
            version.RequestType,
            dto.Pickup,
            dto.Destination,
            dto.ApartmentMove,
            dto.SmallMoveItems,
            dto.SpecialItems,
            dto.Schedule,
            dto.BudgetBand,
            dto.CustomerComment,
            dto.Photos), requirePublishCompleteness: true);

        if (version.RequestType == MoveRequestType.SmallMove && !version.Items.Any(x => x.Kind == MoveItemKind.SmallMoveItem))
        {
            throw new ApiException("REQUEST_INCOMPLETE", "Small move requests require at least one transported item.");
        }
    }

    private static void ValidateLocation(MoveLocationDto? location, bool required, string label)
    {
        if (location is null)
        {
            if (required)
            {
                throw new ApiException("REQUEST_INCOMPLETE", $"{label} location is required.");
            }

            return;
        }

        if (required && (string.IsNullOrWhiteSpace(location.City) || string.IsNullOrWhiteSpace(location.ExactAddress)))
        {
            throw new ApiException("REQUEST_INCOMPLETE", $"{label} city and exact address are required.");
        }

        if (location.Floor is < -5 or > 200)
        {
            throw new ApiException("INVALID_LOCATION", "Floor is outside the supported range.");
        }

        if (location.ParkingDistanceMeters is < 0)
        {
            throw new ApiException("INVALID_LOCATION", "Parking distance cannot be negative.");
        }
    }

    private void ValidateSchedule(MoveScheduleDto? schedule, bool required)
    {
        if (schedule is null)
        {
            if (required)
            {
                throw new ApiException("REQUEST_INCOMPLETE", "Move schedule is required.");
            }

            return;
        }

        if (required && schedule.MoveDate is null)
        {
            throw new ApiException("REQUEST_INCOMPLETE", "Move date is required.");
        }

        if (schedule.MoveDate is not null)
        {
            var today = DateOnly.FromDateTime(_clock.UtcNow.Date);
            if (schedule.MoveDate < today)
            {
                throw new ApiException("INVALID_MOVE_DATE", "Move date cannot be in the past.");
            }
        }

        if (required && (schedule.PreferredTime is null || schedule.DateFlexibility is null))
        {
            throw new ApiException("REQUEST_INCOMPLETE", "Preferred time and date flexibility are required.");
        }
    }

    private static void ValidateApartmentDetails(ApartmentMoveDetailsDto details, bool required)
    {
        if (required && details.NumberOfRooms is null)
        {
            throw new ApiException("REQUEST_INCOMPLETE", "Number of rooms is required for apartment moves.");
        }

        if (details.NumberOfRooms is < 1 or > 20)
        {
            throw new ApiException("INVALID_APARTMENT_DETAILS", "Number of rooms is outside the supported range.");
        }

        if (details.Boxes.Small < 0 || details.Boxes.Medium < 0 || details.Boxes.Large < 0)
        {
            throw new ApiException("INVALID_BOX_COUNTS", "Box counts cannot be negative.");
        }
    }

    private static void ValidateItems(IReadOnlyList<MoveItemDto>? items)
    {
        foreach (var item in items ?? [])
        {
            if (item.Quantity <= 0)
            {
                throw new ApiException("INVALID_ITEM", "Item quantity must be positive.");
            }

            if (item.LengthCm is < 0 || item.WidthCm is < 0 || item.HeightCm is < 0 || item.ApproximateWeightKg is < 0)
            {
                throw new ApiException("INVALID_ITEM", "Dimensions and weight cannot be negative.");
            }

            if (item.Kind == MoveItemKind.ApartmentInventory && item.ApartmentInventoryType is null)
            {
                throw new ApiException("INVALID_ITEM", "Apartment inventory item type is required.");
            }

            if (item.Kind == MoveItemKind.SmallMoveItem && item.SmallMoveCategory is null)
            {
                throw new ApiException("INVALID_ITEM", "Small move item category is required.");
            }

            if (item.Kind == MoveItemKind.SpecialItem && item.SpecialItemType is null)
            {
                throw new ApiException("INVALID_ITEM", "Special item type is required.");
            }
        }
    }

    private static void ValidatePhotos(IReadOnlyList<MovePhotoDto>? photos)
    {
        foreach (var photo in photos ?? [])
        {
            if (string.IsNullOrWhiteSpace(photo.ObjectKey) || string.IsNullOrWhiteSpace(photo.ContentType))
            {
                throw new ApiException("INVALID_PHOTO_METADATA", "Photo object key and content type are required.");
            }

            if (photo.SizeBytes <= 0)
            {
                throw new ApiException("INVALID_PHOTO_METADATA", "Photo size must be positive.");
            }
        }
    }

    private async Task EnforceActiveRequestLimitAsync(Guid customerUserId, Guid currentRequestId, CancellationToken cancellationToken)
    {
        var activeCount = await _dbContext.MoveRequests.CountAsync(
            x => x.CustomerUserId == customerUserId &&
                 x.Id != currentRequestId &&
                 x.Status == MoveRequestStatus.Active,
            cancellationToken);

        if (activeCount >= _options.MaxActiveRequestsPerCustomer)
        {
            throw new ApiException("ACTIVE_REQUEST_LIMIT_REACHED", "Customer has reached the active request limit.");
        }
    }

    private async Task<bool> DetectDuplicateRiskAsync(Guid customerUserId, MoveRequest moveRequest, MoveRequestVersion currentVersion, CancellationToken cancellationToken)
    {
        var currentPickup = currentVersion.Locations.SingleOrDefault(x => x.LocationType == MoveLocationType.Pickup);
        var currentDestination = currentVersion.Locations.SingleOrDefault(x => x.LocationType == MoveLocationType.Destination);
        if (currentPickup?.City is null || currentDestination?.City is null || currentVersion.MoveDate is null)
        {
            return false;
        }

        var candidateRequests = await _dbContext.MoveRequests
            .Include(x => x.CurrentVersion)
            .ThenInclude(x => x!.Locations)
            .Where(x => x.CustomerUserId == customerUserId &&
                        x.Id != moveRequest.Id &&
                        x.RequestType == moveRequest.RequestType &&
                        x.Status == MoveRequestStatus.Active)
            .ToListAsync(cancellationToken);

        foreach (var candidate in candidateRequests)
        {
            var version = candidate.CurrentVersion;
            var pickup = version?.Locations.SingleOrDefault(x => x.LocationType == MoveLocationType.Pickup);
            var destination = version?.Locations.SingleOrDefault(x => x.LocationType == MoveLocationType.Destination);
            if (version?.MoveDate is null || pickup?.City is null || destination?.City is null)
            {
                continue;
            }

            var dateDelta = Math.Abs(version.MoveDate.Value.DayNumber - currentVersion.MoveDate.Value.DayNumber);
            if (dateDelta <= 3 &&
                string.Equals(pickup.City.Trim(), currentPickup.City.Trim(), StringComparison.OrdinalIgnoreCase) &&
                string.Equals(destination.City.Trim(), currentDestination.City.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private int ResolveDefaultLeadPrice(MoveRequestType requestType)
        => requestType == MoveRequestType.SmallMove
            ? _options.DefaultSmallMoveLeadPriceAgorot
            : _options.DefaultApartmentMoveLeadPriceAgorot;

    private static MoveRequestResponse Map(MoveRequest request, MoveRequestVersion? version)
        => new(
            request.Id,
            request.CustomerUserId,
            request.RequestType,
            request.Status,
            request.LeadSalesStatus,
            request.DuplicateRisk,
            new MoneyDto(Currency, request.LeadPriceAgorot),
            request.MaxLeadBuyers,
            request.ActiveBuyerCount,
            request.CreatedAt,
            request.UpdatedAt,
            request.PublishedAt,
            request.ClosedAt,
            request.CancelledAt,
            request.ExpiredAt,
            version is null ? null : MapVersion(version));

    private static MoveRequestVersionResponse MapVersion(MoveRequestVersion version)
    {
        var pickup = version.Locations.SingleOrDefault(x => x.LocationType == MoveLocationType.Pickup);
        var destination = version.Locations.SingleOrDefault(x => x.LocationType == MoveLocationType.Destination);
        var inventoryItems = version.Items
            .Where(x => x.Kind == MoveItemKind.ApartmentInventory)
            .Select(MapItem)
            .ToList();
        var smallMoveItems = version.Items
            .Where(x => x.Kind == MoveItemKind.SmallMoveItem)
            .Select(MapItem)
            .ToList();
        var specialItems = version.Items
            .Where(x => x.Kind == MoveItemKind.SpecialItem)
            .Select(MapItem)
            .ToList();

        return new MoveRequestVersionResponse(
            version.Id,
            version.MoveRequestId,
            version.VersionNumber,
            version.CreatedByUserId,
            version.CreatedAt,
            version.RequestType,
            pickup is null ? null : MapLocation(pickup),
            destination is null ? null : MapLocation(destination),
            version.RequestType == MoveRequestType.ApartmentMove
                ? new ApartmentMoveDetailsDto(
                    version.NumberOfRooms,
                    new BoxCountsDto(version.SmallBoxCount, version.MediumBoxCount, version.LargeBoxCount),
                    inventoryItems,
                    new AdditionalServicesDto(
                        version.FurnitureDisassembly,
                        version.FurnitureAssembly,
                        version.PackingAssistance,
                        version.PackingMaterials))
                : null,
            smallMoveItems,
            specialItems,
            new MoveScheduleDto(version.MoveDate, version.PreferredTime, version.DateFlexibility),
            version.BudgetBand,
            version.CustomerComment,
            version.Photos.OrderBy(x => x.DisplayOrder).Select(MapPhoto).ToList());
    }

    private static MoveLocationDto MapLocation(MoveLocation location)
        => new(
            location.City,
            location.ExactAddress,
            location.Floor,
            location.HasElevator,
            location.ElevatorFurnitureSuitability,
            location.StairsInfo,
            location.TruckAccessInfo,
            location.ParkingDistanceMeters);

    private static MoveItemDto MapItem(MoveItem item)
        => new(
            item.Kind,
            item.ApartmentInventoryType,
            item.SpecialItemType,
            item.SmallMoveCategory,
            item.Name,
            item.Description,
            item.Quantity,
            item.LengthCm,
            item.WidthCm,
            item.HeightCm,
            item.ApproximateWeightKg);

    private static MovePhotoDto MapPhoto(MovePhoto photo)
        => new(photo.ObjectKey, photo.OriginalFileName, photo.ContentType, photo.SizeBytes, photo.DisplayOrder);

    private static string? NormalizeOptional(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        if (trimmed.Length > maxLength)
        {
            throw new ApiException("VALUE_TOO_LONG", $"Value must be {maxLength} characters or fewer.");
        }

        return trimmed;
    }
}
