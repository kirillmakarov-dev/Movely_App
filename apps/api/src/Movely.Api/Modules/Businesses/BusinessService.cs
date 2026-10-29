using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Modules.Identity;
using Movely.Api.Modules.Localities;
using Movely.Api.Shared.Errors;
using Movely.Api.Shared.Time;
using Npgsql;

namespace Movely.Api.Modules.Businesses;

public interface IBusinessService
{
    Task<BusinessProfileDto> CreateAsync(Guid ownerId, BusinessProfileRequest request, CancellationToken ct = default);
    Task<BusinessProfileDto> GetMineAsync(Guid ownerId, CancellationToken ct = default);
    Task<BusinessProfileDto> UpdateAsync(Guid ownerId, UpdateBusinessRequest request, CancellationToken ct = default);
    Task<AdminBusinessPageDto> ListAsync(Guid adminId, AdminBusinessSearch search, CancellationToken ct = default);
    Task<AdminBusinessDetailDto> GetAsync(Guid adminId, Guid businessId, CancellationToken ct = default);
    Task<AdminBusinessDetailDto> ReviewAsync(Guid adminId, Guid businessId, BusinessReviewRequest request, CancellationToken ct = default);
}

public sealed class BusinessService(MovelyDbContext db, IClock clock, ILocalityCatalog localities, IConsentReleaseGate legalGate) : IBusinessService
{
    public async Task<BusinessProfileDto> CreateAsync(Guid ownerId, BusinessProfileRequest request, CancellationToken ct = default)
    {
        await EnsureApplicantAsync(ownerId, ct);
        var profile = ValidateProfile(request);
        if (await db.Businesses.AnyAsync(x => x.OwnerUserId == ownerId, ct)) throw AlreadyExists();
        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
        var now = clock.UtcNow;
        var business = new Business { Id = Guid.NewGuid(), OwnerUserId = ownerId, Status = BusinessStatus.PendingVerification,
            CreatedAt = now, UpdatedAt = now, RevisionId = Guid.NewGuid(), RepresentativeConfirmedAt = now };
        ApplyProfile(business, profile);
        business.Verification = new BusinessVerification { Id = Guid.NewGuid(), BusinessId = business.Id, Status = business.Status, CreatedAt = now, UpdatedAt = now };
        db.Businesses.Add(business);
        await SaveAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Map<BusinessProfileDto>(business, null);
    }

    public async Task<BusinessProfileDto> GetMineAsync(Guid ownerId, CancellationToken ct = default)
    {
        await EnsureActiveUserAsync(ownerId, ct);
        var business = await db.Businesses.AsNoTracking().Include(x => x.Verification).SingleOrDefaultAsync(x => x.OwnerUserId == ownerId, ct) ?? throw NotFound();
        return Map<BusinessProfileDto>(business, await LatestReviewAsync(business, ct));
    }

    public async Task<BusinessProfileDto> UpdateAsync(Guid ownerId, UpdateBusinessRequest request, CancellationToken ct = default)
    {
        await EnsureApplicantAsync(ownerId, ct);
        var profile = ValidateProfile(request);
        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
        var business = await db.Businesses.Include(x => x.Verification).SingleOrDefaultAsync(x => x.OwnerUserId == ownerId, ct) ?? throw NotFound();
        EnsureRevision(business, request.ExpectedRevisionId);
        if (business.Status == BusinessStatus.Suspended) throw new ApiException("BUSINESS_SUSPENDED", "A suspended business requires administrator review before editing.", 403);
        if (business.Status == BusinessStatus.Verified && !request.AcknowledgeReverification)
            throw new ApiException("REVERIFICATION_CONFIRMATION_REQUIRED", "Confirm that editing a verified profile requires a new review.");
        if (business.Status is not (BusinessStatus.PendingVerification or BusinessStatus.Rejected or BusinessStatus.Verified)) throw InvalidState();
        var now = clock.UtcNow;
        ApplyProfile(business, profile);
        business.Status = BusinessStatus.PendingVerification;
        business.RevisionId = Guid.NewGuid();
        business.UpdatedAt = now;
        business.RepresentativeConfirmedAt = now;
        var verification = EnsureVerification(business, now);
        verification.Status = business.Status;
        verification.UpdatedAt = now;
        // Last review metadata remains historical; only a fresh administrator decision replaces it.
        await SaveAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Map<BusinessProfileDto>(business, await LatestReviewAsync(business, ct));
    }

    public async Task<AdminBusinessPageDto> ListAsync(Guid adminId, AdminBusinessSearch search, CancellationToken ct = default)
    {
        await EnsureAdminAsync(adminId, ct);
        var query = db.Businesses.AsNoTracking();
        if (search.Status is { } status) query = query.Where(x => x.Status == status);
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id).Skip((search.Page - 1) * search.PageSize).Take(search.PageSize)
            .Select(x => new AdminBusinessListItemDto(x.Id, x.Name, x.Status, x.RevisionId, x.UpdatedAt)).ToListAsync(ct);
        return new(items, search.Page, search.PageSize, total);
    }

    public async Task<AdminBusinessDetailDto> GetAsync(Guid adminId, Guid businessId, CancellationToken ct = default)
    {
        await EnsureAdminAsync(adminId, ct);
        var business = await db.Businesses.AsNoTracking().Include(x => x.OwnerUser).Include(x => x.Verification).SingleOrDefaultAsync(x => x.Id == businessId, ct) ?? throw NotFound();
        var reviews = await db.BusinessReviews.AsNoTracking().Where(x => x.BusinessId == businessId).OrderByDescending(x => x.ReviewedAt).ThenByDescending(x => x.Id)
            .Select(x => new AdminBusinessReviewDto(x.Id, x.PreviousStatus, x.Status, x.ProfileRevisionId, x.ReviewedAt, x.ReviewedByUserId,
                x.OwnerMessage, x.InternalNotes, x.RegistryChecked, x.RepresentativeChecked)).Take(101).ToListAsync(ct);
        var owner = business.OwnerUser!;
        return Map<AdminBusinessDetailDto>(business, await LatestReviewAsync(business, ct)) with {
            Owner = new(owner.Id, $"{owner.FirstName} {owner.LastName}".Trim(), owner.Phone, owner.PhoneVerified, owner.Status),
            Reviews = reviews.Take(100).ToList(), HasMoreReviews = reviews.Count > 100,
        };
    }

    public async Task<AdminBusinessDetailDto> ReviewAsync(Guid adminId, Guid businessId, BusinessReviewRequest request, CancellationToken ct = default)
    {
        await EnsureAdminAsync(adminId, ct);
        if (request.Decision is null || !Enum.IsDefined(request.Decision.Value)) throw new ApiException("INVALID_BUSINESS_REVIEW", "Choose a supported review decision.");
        var ownerMessage = OptionalText(request.OwnerMessage, 1000);
        var notes = OptionalText(request.InternalNotes, 1000);
        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
        var business = await db.Businesses.Include(x => x.Verification).SingleOrDefaultAsync(x => x.Id == businessId, ct) ?? throw NotFound();
        if (business.OwnerUserId == adminId) throw new ApiException("SELF_REVIEW_FORBIDDEN", "Administrators cannot review their own business.", 403);
        EnsureRevision(business, request.ExpectedRevisionId);
        BusinessStatus next;
        switch (request.Decision)
        {
            case BusinessReviewDecision.Verify:
                if (business.Status != BusinessStatus.PendingVerification) throw InvalidState();
                await EnsureApplicantAsync(business.OwnerUserId, ct);
                ValidateProfile(new(business.Name, business.RegistrationNumber, business.RegisteredAddress, business.RepresentativeName, business.ServiceAreaCodes, business.RepresentativeConfirmedAt.HasValue));
                if (!request.RegistryChecked || !request.RepresentativeChecked || notes is null || notes.Length < 10)
                    throw new ApiException("INVALID_BUSINESS_REVIEW", "Registry and representative checks and meaningful review notes are required.");
                next = BusinessStatus.Verified;
                break;
            case BusinessReviewDecision.Reject:
                if (business.Status != BusinessStatus.PendingVerification) throw InvalidState();
                RequireReason(ownerMessage);
                next = BusinessStatus.Rejected;
                break;
            case BusinessReviewDecision.Suspend:
                if (business.Status != BusinessStatus.Verified) throw InvalidState();
                RequireReason(ownerMessage);
                next = BusinessStatus.Suspended;
                break;
            default:
                if (business.Status is not (BusinessStatus.Rejected or BusinessStatus.Suspended)) throw InvalidState();
                RequireReason(ownerMessage);
                next = BusinessStatus.PendingVerification;
                break;
        }
        var now = clock.UtcNow;
        var review = new BusinessReview {
            Id = Guid.NewGuid(), BusinessId = business.Id, PreviousStatus = business.Status, Status = next,
            ProfileRevisionId = business.RevisionId, ReviewedAt = now, ReviewedByUserId = adminId,
            OwnerMessage = ownerMessage, InternalNotes = notes, RegistryChecked = request.RegistryChecked, RepresentativeChecked = request.RepresentativeChecked,
            ProfileSnapshotJson = JsonSerializer.Serialize(new {
                business.Name, business.RegistrationNumber, business.RegisteredAddress, business.RepresentativeName,
                business.ServiceAreaCodes, business.RepresentativeConfirmedAt, business.RevisionId,
            }, new JsonSerializerOptions(JsonSerializerDefaults.Web)),
        };
        db.BusinessReviews.Add(review);
        business.Status = next;
        business.RevisionId = Guid.NewGuid();
        business.UpdatedAt = now;
        var verification = EnsureVerification(business, now);
        verification.Status = next;
        verification.ReviewedByUserId = adminId;
        verification.ReviewedAt = now;
        verification.ReviewedProfileRevisionId = review.ProfileRevisionId;
        verification.OwnerMessage = ownerMessage;
        verification.Notes = notes;
        verification.RegistryChecked = request.RegistryChecked;
        verification.RepresentativeChecked = request.RepresentativeChecked;
        verification.UpdatedAt = now;
        await SaveAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return await GetAsync(adminId, businessId, ct);
    }

    private async Task<MovelyUser> EnsureActiveUserAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == userId, ct);
        if (user is null || user.Status != UserStatus.Active) throw new ApiException("ACCOUNT_NOT_ACTIVE", "An active account is required.", 403);
        return user;
    }
    private async Task EnsureAdminAsync(Guid userId, CancellationToken ct)
    {
        if ((await EnsureActiveUserAsync(userId, ct)).Role != UserRole.Admin) throw new ApiException("ADMIN_REQUIRED", "Administrator access is required.", 403);
    }
    private async Task EnsureApplicantAsync(Guid userId, CancellationToken ct)
    {
        var user = await EnsureActiveUserAsync(userId, ct);
        if (user.Role is not (UserRole.Customer or UserRole.Mover)) throw new ApiException("BUSINESS_OWNER_ROLE_REQUIRED", "Only customers and movers may apply for a business profile.", 403);
        legalGate.EnsureAvailable();
        if (!user.PhoneVerified) throw new ApiException("PHONE_NOT_VERIFIED", "Verify your phone before submitting a business profile.", 403);
        if (!await ConsentPolicy.HasCurrentAsync(db, userId, ct)) throw new ApiException("POLICY_ACCEPTANCE_REQUIRED", "Accept the current policies before submitting a business profile.", 403);
    }

    private ValidatedProfile ValidateProfile(BusinessProfileRequest request)
    {
        if (!request.AuthorizedRepresentative) throw new ApiException("REPRESENTATIVE_CONFIRMATION_REQUIRED", "Confirm that you are authorized to represent this business.");
        var name = RequiredText(request.Name, 2, 120);
        var address = RequiredText(request.RegisteredAddress, 2, 300);
        var representative = RequiredText(request.RepresentativeName, 2, 120);
        var number = request.RegistrationNumber?.Trim();
        if (number is null || number.Length != 9 || number.Any(c => c < '0' || c > '9')) throw InvalidProfile();
        var codes = request.ServiceAreaCodes;
        if (codes is null || codes.Count < 1 || codes.Count > 20 || codes.Distinct(StringComparer.Ordinal).Count() != codes.Count || codes.Any(c => c is null || localities.FindByCode(c) is null)) throw InvalidProfile();
        return new(name, number, address, representative, codes.ToArray());
    }
    private static void ApplyProfile(Business business, ValidatedProfile profile)
    {
        business.Name = profile.Name;
        business.RegistrationNumber = profile.RegistrationNumber;
        business.RegisteredAddress = profile.RegisteredAddress;
        business.RepresentativeName = profile.RepresentativeName;
        business.ServiceAreaCodes = profile.ServiceAreaCodes;
    }
    private static string RequiredText(string? value, int minimum, int maximum)
    {
        var trimmed = value?.Trim();
        if (trimmed is null || trimmed.Length < minimum || trimmed.Length > maximum || trimmed.Any(char.IsControl)) throw InvalidProfile();
        return trimmed;
    }
    private static string? OptionalText(string? value, int maximum)
    {
        if (value?.Any(c => char.IsControl(c) && c is not ('\r' or '\n' or '\t')) == true)
            throw new ApiException("INVALID_BUSINESS_REVIEW", "Review text contains unsupported control characters.");
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return null;
        if (trimmed.Length > maximum) throw new ApiException("INVALID_BUSINESS_REVIEW", "Review text is too long.");
        return trimmed;
    }
    private static void RequireReason(string? value)
    {
        if (value is null || value.Length < 2) throw new ApiException("INVALID_BUSINESS_REVIEW", "A reason visible to the business owner is required.");
    }
    private static void EnsureRevision(Business business, Guid expected)
    {
        if (expected == Guid.Empty) throw new ApiException("EXPECTED_REVISION_REQUIRED", "The current profile revision is required.");
        if (business.RevisionId != expected) throw Conflict();
    }
    private static BusinessVerification EnsureVerification(Business business, DateTimeOffset now)
        => business.Verification ??= new BusinessVerification { Id = Guid.NewGuid(), BusinessId = business.Id, CreatedAt = now, UpdatedAt = now, Status = business.Status };
    private Task<OwnerBusinessReviewDto?> LatestReviewAsync(Business business, CancellationToken ct)
    {
        var revision = business.Verification?.ReviewedProfileRevisionId;
        return revision is null ? Task.FromResult<OwnerBusinessReviewDto?>(null) : db.BusinessReviews.AsNoTracking()
            .Where(x => x.BusinessId == business.Id && x.ProfileRevisionId == revision)
            .Select(x => new OwnerBusinessReviewDto(x.Status, x.ReviewedAt, x.OwnerMessage)).SingleOrDefaultAsync(ct);
    }
    private T Map<T>(Business business, OwnerBusinessReviewDto? latest) where T : BusinessProfileDto, new() => new() {
        Id = business.Id, Name = business.Name, RegistrationNumber = business.RegistrationNumber, RegisteredAddress = business.RegisteredAddress,
        RepresentativeName = business.RepresentativeName, ServiceAreas = business.ServiceAreaCodes.Select(localities.FindByCode).OfType<LocalityDto>().ToList(),
        Status = business.Status, RevisionId = business.RevisionId, CreatedAt = business.CreatedAt, UpdatedAt = business.UpdatedAt,
        RepresentativeConfirmedAt = business.RepresentativeConfirmedAt, LatestReview = latest,
    };
    private async Task SaveAsync(CancellationToken ct)
    {
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw Conflict(); }
        catch (DbUpdateException error) when (error.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "IX_Businesses_OwnerUserId" }) { throw AlreadyExists(); }
        catch (DbUpdateException error) when (error.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "IX_BusinessReviews_BusinessId_ProfileRevisionId" }) { throw Conflict(); }
    }
    private static ApiException NotFound() => new("BUSINESS_NOT_FOUND", "Business profile was not found.", 404);
    private static ApiException AlreadyExists() => new("BUSINESS_ALREADY_EXISTS", "This account already has a business profile.", 409);
    private static ApiException Conflict() => new("BUSINESS_REVISION_CONFLICT", "The business profile changed. Reload it before continuing.", 409);
    private static ApiException InvalidState() => new("INVALID_BUSINESS_STATE", "This action is not available in the current business status.");
    private static ApiException InvalidProfile() => new("INVALID_BUSINESS_PROFILE", "Check the business name, registration number, address, representative and service areas.");
    private sealed record ValidatedProfile(string Name, string RegistrationNumber, string RegisteredAddress, string RepresentativeName, string[] ServiceAreaCodes);
}
