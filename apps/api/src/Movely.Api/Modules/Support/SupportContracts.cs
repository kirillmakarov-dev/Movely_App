using System.Globalization;
using Movely.Api.Data;
using Movely.Api.Shared.Errors;

namespace Movely.Api.Modules.Support;

public sealed class SupportOptions { public bool RequestsEnabled { get; set; } }
public sealed record SupportCapabilitiesDto(bool RequestsEnabled);
public sealed record CreateSupportRequest(Guid ClientMutationId, SupportRequestType? Type, string? Subject, string? Message, Guid ExpectedActorUserId);
public sealed record SupportReplyRequest(Guid ClientMutationId, Guid ExpectedRevisionId, string? Body, Guid ExpectedActorUserId);
public sealed record SupportCancelRequest(Guid ClientMutationId, Guid ExpectedRevisionId, Guid ExpectedActorUserId);
public sealed record AdminSupportReplyRequest(Guid ClientMutationId, Guid ExpectedRevisionId, string? Body, SupportRequestStatus? Status, Guid ExpectedActorUserId);
public sealed record AdminSupportStatusRequest(Guid ClientMutationId, Guid ExpectedRevisionId, SupportRequestStatus? Status, Guid ExpectedActorUserId);
public record SupportRequestSummaryDto(Guid Id, SupportRequestType Type, string Subject, SupportRequestStatus Status,
    Guid RevisionId, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record SupportRequestPageDto(IReadOnlyList<SupportRequestSummaryDto> Items, int Page, int PageSize, int TotalCount);
public sealed record SupportHistoryItemDto(Guid Id, Guid ClientMutationId, int SequenceNumber, SupportEventActor Actor,
    SupportEventKind Kind, string? Body, SupportRequestStatus? PreviousStatus, SupportRequestStatus Status, Guid RevisionId, DateTimeOffset CreatedAt);
public sealed record SupportHistoryPageDto(IReadOnlyList<SupportHistoryItemDto> Items, int Page, int PageSize, int TotalCount);
public record SupportRequestDetailDto(Guid Id, SupportRequestType Type, string Subject, SupportRequestStatus Status,
    Guid RevisionId, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, Guid ClientMutationId, SupportHistoryPageDto History)
    : SupportRequestSummaryDto(Id, Type, Subject, Status, RevisionId, CreatedAt, UpdatedAt);
public sealed record AdminSupportOwnerDto(Guid Id, string Name);
public sealed record AdminSupportRequestDetailDto(Guid Id, SupportRequestType Type, string Subject, SupportRequestStatus Status,
    Guid RevisionId, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, Guid ClientMutationId, SupportHistoryPageDto History, AdminSupportOwnerDto Owner)
    : SupportRequestDetailDto(Id, Type, Subject, Status, RevisionId, CreatedAt, UpdatedAt, ClientMutationId, History);
public sealed record CreateSupportResponse(SupportRequestDetailDto Request, bool AlreadyCreated);
public sealed record SupportCommandResponse(SupportRequestDetailDto Request, bool AlreadyApplied, Guid EventId);
public sealed record AdminSupportCommandResponse(AdminSupportRequestDetailDto Request, bool AlreadyApplied, Guid EventId);

public sealed record SupportRequestQuery(SupportRequestType? Type, SupportRequestStatus? Status, int Page, int PageSize)
{
    public static SupportRequestQuery Parse(IQueryCollection query, bool history = false)
    {
        string? Value(string name) {
            if (!query.TryGetValue(name, out var values)) return null;
            if (values.Count != 1 || string.IsNullOrEmpty(values[0])) throw Invalid();
            return values[0];
        }
        T? Choice<T>(string key) where T : struct, Enum {
            var value = Value(key);
            if (value is null) return null;
            if (!Enum.TryParse<T>(value, out var parsed) || !Enum.IsDefined(parsed) || parsed.ToString() != value) throw Invalid();
            return parsed;
        }
        int Number(string key, int fallback, int max) {
            var value = Value(key);
            if (value is null) return fallback;
            if (!int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var parsed) || parsed < 1 || parsed > max) throw Invalid();
            return parsed;
        }
        var page = Number("page", 1, int.MaxValue);
        var size = Number("pageSize", history ? 50 : 12, 50);
        if ((long)(page - 1) * size > int.MaxValue) throw Invalid();
        return new(Choice<SupportRequestType>("type"), Choice<SupportRequestStatus>("status"), page, size);
    }
    public static SupportRequestQuery RecentHistory => new(null, null, 1, 50);
    private static ApiException Invalid() => new("INVALID_SUPPORT_QUERY", "Choose supported filters and a valid page size.");
}
