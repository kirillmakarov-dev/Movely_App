using System.Globalization;
using Movely.Api.Data;
using Movely.Api.Modules.Localities;
using Movely.Api.Shared.Errors;

namespace Movely.Api.Modules.Businesses;

public record BusinessProfileRequest(string? Name, string? RegistrationNumber, string? RegisteredAddress,
    string? RepresentativeName, IReadOnlyList<string>? ServiceAreaCodes, bool AuthorizedRepresentative);
public sealed record UpdateBusinessRequest(string? Name, string? RegistrationNumber, string? RegisteredAddress,
    string? RepresentativeName, IReadOnlyList<string>? ServiceAreaCodes, bool AuthorizedRepresentative,
    Guid ExpectedRevisionId, bool AcknowledgeReverification = false)
    : BusinessProfileRequest(Name, RegistrationNumber, RegisteredAddress, RepresentativeName, ServiceAreaCodes, AuthorizedRepresentative);
public enum BusinessReviewDecision { Verify, Reject, Suspend, Reopen }
public sealed record BusinessReviewRequest(Guid ExpectedRevisionId, BusinessReviewDecision? Decision, string? OwnerMessage,
    string? InternalNotes, bool RegistryChecked, bool RepresentativeChecked);

public record BusinessProfileDto
{
    public Guid Id { get; init; }
    public string? Name { get; init; }
    public string? RegistrationNumber { get; init; }
    public string? RegisteredAddress { get; init; }
    public string? RepresentativeName { get; init; }
    public IReadOnlyList<LocalityDto> ServiceAreas { get; init; } = [];
    public BusinessStatus Status { get; init; }
    public Guid RevisionId { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset UpdatedAt { get; init; }
    public DateTimeOffset? RepresentativeConfirmedAt { get; init; }
    public OwnerBusinessReviewDto? LatestReview { get; init; }
}
public sealed record OwnerBusinessReviewDto(BusinessStatus Status, DateTimeOffset ReviewedAt, string? OwnerMessage);
public sealed record AdminBusinessListItemDto(Guid Id, string? Name, BusinessStatus Status, Guid RevisionId, DateTimeOffset UpdatedAt);
public sealed record AdminBusinessPageDto(IReadOnlyList<AdminBusinessListItemDto> Items, int Page, int PageSize, int TotalCount);
public sealed record AdminBusinessOwnerDto(Guid Id, string Name, string? Phone, bool PhoneVerified, UserStatus Status);
public sealed record AdminBusinessReviewDto(Guid Id, BusinessStatus PreviousStatus, BusinessStatus Status, Guid ProfileRevisionId,
    DateTimeOffset ReviewedAt, Guid ReviewedByUserId, string? OwnerMessage, string? InternalNotes, bool RegistryChecked, bool RepresentativeChecked);
public sealed record AdminBusinessDetailDto : BusinessProfileDto
{
    public AdminBusinessOwnerDto Owner { get; init; } = null!;
    public IReadOnlyList<AdminBusinessReviewDto> Reviews { get; init; } = [];
    public bool HasMoreReviews { get; init; }
}

public sealed record AdminBusinessSearch(BusinessStatus? Status, int Page, int PageSize)
{
    public static AdminBusinessSearch Parse(IQueryCollection query)
    {
        string? Value(string name)
        {
            if (!query.TryGetValue(name, out var value)) return null;
            if (value.Count != 1 || string.IsNullOrEmpty(value[0])) throw Invalid(name);
            return value[0];
        }
        int Number(string key, int fallback, int maximum)
        {
            var raw = Value(key);
            if (raw is null) return fallback;
            if (!int.TryParse(raw, NumberStyles.None, CultureInfo.InvariantCulture, out var value) || value < 1 || value > maximum) throw Invalid(key);
            return value;
        }
        BusinessStatus? status = null;
        if (Value("status") is { } rawStatus)
        {
            if (!Enum.TryParse<BusinessStatus>(rawStatus, out var parsed) || !Enum.IsDefined(parsed) || parsed.ToString() != rawStatus) throw Invalid("status");
            status = parsed;
        }
        var page = Number("page", 1, int.MaxValue);
        var pageSize = Number("pageSize", 12, 50);
        if ((long)(page - 1) * pageSize > int.MaxValue) throw Invalid("page");
        return new(status, page, pageSize);
    }
    private static ApiException Invalid(string field) => new("INVALID_BUSINESS_FILTER", $"The {field} filter is invalid.");
}
