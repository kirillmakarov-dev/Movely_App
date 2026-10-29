using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Shared.Errors;
using Movely.Api.Shared.Time;
using Npgsql;

namespace Movely.Api.Modules.Support;

public interface ISupportRequestService
{
    Task<CreateSupportResponse> CreateAsync(Guid actorId, CreateSupportRequest request, CancellationToken ct = default);
    Task<SupportRequestPageDto> ListOwnedAsync(Guid actorId, SupportRequestQuery query, CancellationToken ct = default);
    Task<SupportRequestDetailDto> GetOwnedAsync(Guid actorId, Guid requestId, SupportRequestQuery query, CancellationToken ct = default);
    Task<SupportRequestDetailDto> FindSubmissionAsync(Guid actorId, Guid clientMutationId, CancellationToken ct = default);
    Task<SupportCommandResponse> ReplyOwnedAsync(Guid actorId, Guid requestId, SupportReplyRequest request, CancellationToken ct = default);
    Task<SupportCommandResponse> CancelOwnedAsync(Guid actorId, Guid requestId, SupportCancelRequest request, CancellationToken ct = default);
    Task<SupportRequestPageDto> ListAdminAsync(Guid actorId, SupportRequestQuery query, CancellationToken ct = default);
    Task<AdminSupportRequestDetailDto> GetAdminAsync(Guid actorId, Guid requestId, SupportRequestQuery query, CancellationToken ct = default);
    Task<AdminSupportCommandResponse> ReplyAdminAsync(Guid actorId, Guid requestId, AdminSupportReplyRequest request, CancellationToken ct = default);
    Task<AdminSupportCommandResponse> SetStatusAdminAsync(Guid actorId, Guid requestId, AdminSupportStatusRequest request, CancellationToken ct = default);
}

public sealed class SupportRequestService(MovelyDbContext db, IClock clock, IOptionsMonitor<SupportOptions> options) : ISupportRequestService
{
    public async Task<CreateSupportResponse> CreateAsync(Guid actorId, CreateSupportRequest request, CancellationToken ct = default)
    {
        await EnsureActorAsync(actorId, false, ct);
        ExpectedActor(request.ExpectedActorUserId, actorId);
        MutationId(request.ClientMutationId);
        if (request.Type is null || !Enum.IsDefined(request.Type.Value)) throw InvalidRequest();
        var subject = Text(request.Subject, 2, 160, false, "INVALID_SUPPORT_REQUEST");
        var message = Text(request.Message, 2, 4000, true, "INVALID_SUPPORT_MESSAGE");
        var duplicate = await FindCreateAsync(actorId, request.ClientMutationId, ct);
        if (duplicate is not null) return await ExistingCreateAsync(actorId, duplicate, request.Type.Value, subject, message, ct);
        EnsureEnabled();
        await using var tx = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
        var now = clock.UtcNow;
        var row = new SupportRequest {
            Id = Guid.NewGuid(), OwnerUserId = actorId, ClientMutationId = request.ClientMutationId,
            Type = request.Type.Value, Subject = subject, Status = SupportRequestStatus.Open,
            RevisionId = Guid.NewGuid(), LastSequenceNumber = 1, CreatedAt = now, UpdatedAt = now,
        };
        row.Events.Add(new SupportRequestEvent {
            Id = Guid.NewGuid(), SupportRequestId = row.Id, ActorUserId = actorId, ClientMutationId = request.ClientMutationId,
            RevisionId = row.RevisionId, SequenceNumber = 1, Actor = SupportEventActor.Owner, Kind = SupportEventKind.Created,
            Body = message, Status = row.Status, CreatedAt = now,
        });
        db.SupportRequests.Add(row);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException error) when (Unique(error, "IX_SupportRequests_OwnerUserId_ClientMutationId")) {
            if (tx is not null) await tx.RollbackAsync(ct);
            db.ChangeTracker.Clear();
            duplicate = await FindCreateAsync(actorId, request.ClientMutationId, ct);
            if (duplicate is null) throw Conflict();
            return await ExistingCreateAsync(actorId, duplicate, request.Type.Value, subject, message, ct);
        }
        var detail = await ReadDetailAsync(actorId, row.Id, SupportRequestQuery.RecentHistory, false, ct);
        if (tx is not null) await tx.CommitAsync(ct);
        return new(detail, false);
    }

    public async Task<SupportRequestPageDto> ListOwnedAsync(Guid actorId, SupportRequestQuery query, CancellationToken ct = default)
    { await EnsureActorAsync(actorId, false, ct); return await ListAsync(actorId, query, false, ct); }
    public async Task<SupportRequestPageDto> ListAdminAsync(Guid actorId, SupportRequestQuery query, CancellationToken ct = default)
    { await EnsureActorAsync(actorId, true, ct); return await ListAsync(actorId, query, true, ct); }
    public async Task<SupportRequestDetailDto> GetOwnedAsync(Guid actorId, Guid requestId, SupportRequestQuery query, CancellationToken ct = default)
    { await EnsureActorAsync(actorId, false, ct); return await ReadDetailAsync(actorId, requestId, query, false, ct); }
    public async Task<AdminSupportRequestDetailDto> GetAdminAsync(Guid actorId, Guid requestId, SupportRequestQuery query, CancellationToken ct = default)
    { await EnsureActorAsync(actorId, true, ct); return (AdminSupportRequestDetailDto)await ReadDetailAsync(actorId, requestId, query, true, ct); }
    public async Task<SupportRequestDetailDto> FindSubmissionAsync(Guid actorId, Guid clientMutationId, CancellationToken ct = default)
    {
        await EnsureActorAsync(actorId, false, ct);
        MutationId(clientMutationId);
        var row = await FindCreateAsync(actorId, clientMutationId, ct) ?? throw NotFound();
        return await ReadDetailAsync(actorId, row.Id, SupportRequestQuery.RecentHistory, false, ct);
    }
    public async Task<SupportCommandResponse> ReplyOwnedAsync(Guid actorId, Guid requestId, SupportReplyRequest request, CancellationToken ct = default)
    {
        var result = await CommandAsync(actorId, requestId, false, request.ClientMutationId, request.ExpectedRevisionId, request.ExpectedActorUserId,
            SupportEventKind.Message, Text(request.Body, 2, 4000, true, "INVALID_SUPPORT_MESSAGE"), null, ct);
        return new(result.Detail, result.AlreadyApplied, result.EventId);
    }
    public async Task<SupportCommandResponse> CancelOwnedAsync(Guid actorId, Guid requestId, SupportCancelRequest request, CancellationToken ct = default)
    {
        var result = await CommandAsync(actorId, requestId, false, request.ClientMutationId, request.ExpectedRevisionId, request.ExpectedActorUserId, SupportEventKind.Cancelled, null, null, ct);
        return new(result.Detail, result.AlreadyApplied, result.EventId);
    }
    public async Task<AdminSupportCommandResponse> ReplyAdminAsync(Guid actorId, Guid requestId, AdminSupportReplyRequest request, CancellationToken ct = default)
    {
        if (request.Status is null || !Enum.IsDefined(request.Status.Value) || request.Status == SupportRequestStatus.Cancelled) throw InvalidState();
        var result = await CommandAsync(actorId, requestId, true, request.ClientMutationId, request.ExpectedRevisionId, request.ExpectedActorUserId,
            SupportEventKind.Message, Text(request.Body, 2, 4000, true, "INVALID_SUPPORT_MESSAGE"), request.Status, ct);
        return new((AdminSupportRequestDetailDto)result.Detail, result.AlreadyApplied, result.EventId);
    }
    public async Task<AdminSupportCommandResponse> SetStatusAdminAsync(Guid actorId, Guid requestId, AdminSupportStatusRequest request, CancellationToken ct = default)
    {
        if (request.Status != SupportRequestStatus.InReview) throw InvalidState();
        var result = await CommandAsync(actorId, requestId, true, request.ClientMutationId, request.ExpectedRevisionId, request.ExpectedActorUserId,
            SupportEventKind.StatusChanged, null, request.Status, ct);
        return new((AdminSupportRequestDetailDto)result.Detail, result.AlreadyApplied, result.EventId);
    }

    private async Task<CommandResult> CommandAsync(Guid actorId, Guid requestId, bool admin, Guid mutationId, Guid expectedRevision, Guid expectedActorUserId,
        SupportEventKind kind, string? body, SupportRequestStatus? requestedStatus, CancellationToken ct)
    {
        await EnsureActorAsync(actorId, admin, ct);
        ExpectedActor(expectedActorUserId, actorId);
        MutationId(mutationId);
        if (expectedRevision == Guid.Empty) throw new ApiException("EXPECTED_REVISION_REQUIRED", "The current request revision is required.");
        await using var tx = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
        var row = await db.SupportRequests.SingleOrDefaultAsync(x => x.Id == requestId && (admin || x.OwnerUserId == actorId), ct) ?? throw NotFound();
        var actor = admin ? SupportEventActor.Support : SupportEventActor.Owner;
        var duplicate = await FindCommandAsync(actorId, requestId, mutationId, admin, ct);
        if (duplicate is not null)
            return await ExistingCommandAsync(actorId, requestId, admin, duplicate, expectedRevision, kind, actor, body, requestedStatus, ct);
        if (row.RevisionId != expectedRevision) throw Conflict();
        if (kind == SupportEventKind.Message) EnsureEnabled();
        if (row.Status == SupportRequestStatus.Cancelled || !Enum.IsDefined(row.Status)) throw InvalidState();
        var next = row.Status;
        if (kind == SupportEventKind.Cancelled) {
            if (row.Status == SupportRequestStatus.Resolved) throw InvalidState();
            next = SupportRequestStatus.Cancelled;
        } else if (kind == SupportEventKind.StatusChanged) {
            if (row.Status == SupportRequestStatus.InReview) throw InvalidState();
            next = SupportRequestStatus.InReview;
        } else if (admin) next = requestedStatus!.Value;
        else if (row.Status is SupportRequestStatus.Resolved or SupportRequestStatus.WaitingForUser) next = SupportRequestStatus.Open;
        if (row.LastSequenceNumber < 1 || row.LastSequenceNumber == int.MaxValue) throw InvalidState();
        var now = clock.UtcNow;
        var entry = new SupportRequestEvent {
            Id = Guid.NewGuid(), SupportRequestId = row.Id, ActorUserId = actorId, ClientMutationId = mutationId,
            ExpectedRevisionId = expectedRevision, RevisionId = Guid.NewGuid(), SequenceNumber = row.LastSequenceNumber + 1,
            Actor = actor, Kind = kind, Body = body, RequestedStatus = requestedStatus, PreviousStatus = row.Status, Status = next, CreatedAt = now,
        };
        row.Status = next;
        row.RevisionId = entry.RevisionId;
        row.LastSequenceNumber = entry.SequenceNumber;
        row.UpdatedAt = now;
        db.SupportRequestEvents.Add(entry);
        try { await db.SaveChangesAsync(ct); }
        catch (Exception error) when (error is DbUpdateConcurrencyException ||
            error is DbUpdateException update && (Unique(update, "IX_SupportRequestEvents_ActorMutation") || Unique(update, "IX_SupportRequestEvents_SupportRequestId_SequenceNumber"))) {
            if (tx is not null) await tx.RollbackAsync(ct);
            db.ChangeTracker.Clear();
            duplicate = await FindCommandAsync(actorId, requestId, mutationId, admin, ct);
            if (duplicate is null) throw Conflict();
            return await ExistingCommandAsync(actorId, requestId, admin, duplicate, expectedRevision, kind, actor, body, requestedStatus, ct);
        }
        var detail = await ReadDetailAsync(actorId, requestId, SupportRequestQuery.RecentHistory, admin, ct);
        if (tx is not null) await tx.CommitAsync(ct);
        return new(detail, false, entry.Id);
    }

    private async Task<SupportRequestPageDto> ListAsync(Guid actorId, SupportRequestQuery search, bool admin, CancellationToken ct)
    {
        var query = db.SupportRequests.AsNoTracking().Where(x => admin || x.OwnerUserId == actorId);
        if (search.Type.HasValue) query = query.Where(x => x.Type == search.Type);
        if (search.Status.HasValue) query = query.Where(x => x.Status == search.Status);
        var count = await query.CountAsync(ct);
        var items = await query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id)
            .Skip((search.Page - 1) * search.PageSize).Take(search.PageSize)
            .Select(x => new SupportRequestSummaryDto(x.Id, x.Type, x.Subject, x.Status, x.RevisionId, x.CreatedAt, x.UpdatedAt)).ToListAsync(ct);
        return new(items, search.Page, search.PageSize, count);
    }
    private async Task<SupportRequestDetailDto> ReadDetailAsync(Guid actorId, Guid requestId, SupportRequestQuery page, bool admin, CancellationToken ct)
    {
        var row = await db.SupportRequests.AsNoTracking().SingleOrDefaultAsync(x => x.Id == requestId && (admin || x.OwnerUserId == actorId), ct) ?? throw NotFound();
        // Every history query carries the owner scope independently of the preceding metadata read.
        var events = db.SupportRequestEvents.AsNoTracking().Where(x => x.SupportRequestId == requestId && (admin || x.Request!.OwnerUserId == actorId));
        var total = await events.CountAsync(ct);
        var items = await events.OrderByDescending(x => x.SequenceNumber).Skip((page.Page - 1) * page.PageSize).Take(page.PageSize)
            .Select(x => new SupportHistoryItemDto(x.Id, x.ClientMutationId, x.SequenceNumber, x.Actor, x.Kind, x.Body,
                x.PreviousStatus, x.Status, x.RevisionId, x.CreatedAt)).ToListAsync(ct);
        var history = new SupportHistoryPageDto(items, page.Page, page.PageSize, total);
        if (!admin) return new(row.Id, row.Type, row.Subject, row.Status, row.RevisionId, row.CreatedAt, row.UpdatedAt, row.ClientMutationId, history);
        var owner = await db.Users.AsNoTracking().Where(x => x.Id == row.OwnerUserId)
            .Select(x => new AdminSupportOwnerDto(x.Id, (x.FirstName + " " + x.LastName).Trim())).SingleAsync(ct);
        return new AdminSupportRequestDetailDto(row.Id, row.Type, row.Subject, row.Status, row.RevisionId, row.CreatedAt, row.UpdatedAt, row.ClientMutationId, history, owner);
    }
    private Task<SupportRequest?> FindCreateAsync(Guid actorId, Guid mutationId, CancellationToken ct)
        => db.SupportRequests.AsNoTracking().SingleOrDefaultAsync(x => x.OwnerUserId == actorId && x.ClientMutationId == mutationId, ct);
    private async Task<CreateSupportResponse> ExistingCreateAsync(Guid actorId, SupportRequest row, SupportRequestType type, string subject, string body, CancellationToken ct)
    {
        var initial = await db.SupportRequestEvents.AsNoTracking().SingleOrDefaultAsync(x => x.SupportRequestId == row.Id && x.SequenceNumber == 1 && x.Request!.OwnerUserId == actorId, ct);
        if (row.Type != type || row.Subject != subject || initial is null || initial.ActorUserId != actorId || initial.Actor != SupportEventActor.Owner || initial.Body != body) throw IdempotencyConflict();
        return new(await ReadDetailAsync(actorId, row.Id, SupportRequestQuery.RecentHistory, false, ct), true);
    }
    private Task<SupportRequestEvent?> FindCommandAsync(Guid actorId, Guid requestId, Guid mutationId, bool admin, CancellationToken ct)
        => db.SupportRequestEvents.AsNoTracking().SingleOrDefaultAsync(x => x.SupportRequestId == requestId && x.ActorUserId == actorId &&
            x.ClientMutationId == mutationId && (admin || x.Request!.OwnerUserId == actorId), ct);
    private async Task<CommandResult> ExistingCommandAsync(Guid actorId, Guid requestId, bool admin, SupportRequestEvent entry,
        Guid expected, SupportEventKind kind, SupportEventActor actor, string? body, SupportRequestStatus? requestedStatus, CancellationToken ct)
    {
        if (entry.ExpectedRevisionId != expected || entry.Kind != kind || entry.Actor != actor || entry.Body != body || entry.RequestedStatus != requestedStatus) throw IdempotencyConflict();
        return new(await ReadDetailAsync(actorId, requestId, SupportRequestQuery.RecentHistory, admin, ct), true, entry.Id);
    }
    private async Task EnsureActorAsync(Guid actorId, bool admin, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == actorId, ct);
        if (user is null || user.Status != UserStatus.Active) throw new ApiException("ACCOUNT_NOT_ACTIVE", "An active account is required.", 403);
        if (admin && user.Role != UserRole.Admin) throw new ApiException("ADMIN_REQUIRED", "Administrator access is required.", 403);
        if (!admin && user.Role is not (UserRole.Customer or UserRole.Mover)) throw new ApiException("SUPPORT_OWNER_ROLE_REQUIRED", "Customer or mover access is required.", 403);
    }
    private void EnsureEnabled() { if (!options.CurrentValue.RequestsEnabled) throw new ApiException("SUPPORT_REQUESTS_DISABLED", "New support submissions and replies are currently unavailable.", 503); }
    private static void ExpectedActor(Guid expected, Guid actual) { if (expected == Guid.Empty || expected != actual) throw new ApiException("SUPPORT_ACCOUNT_CHANGED", "The signed-in account changed. Reload before sending.", 403); }
    private static void MutationId(Guid id) { if (id == Guid.Empty) throw new ApiException("SUPPORT_MUTATION_ID_REQUIRED", "A unique command identifier is required."); }
    private static string Text(string? value, int min, int max, bool multiline, string code)
    {
        if (value?.Any(c => char.IsControl(c) && (!multiline || c is not ('\r' or '\n' or '\t'))) == true)
            throw new ApiException(code, "Text contains unsupported control characters.");
        var text = value?.Trim();
        if (text is null || text.Length < min || text.Length > max) throw new ApiException(code, $"Text must contain between {min} and {max} characters.");
        return text;
    }
    private static bool Unique(DbUpdateException error, string constraint) => error.InnerException is PostgresException pg && pg.SqlState == PostgresErrorCodes.UniqueViolation && pg.ConstraintName == constraint;
    private static ApiException InvalidRequest() => new("INVALID_SUPPORT_REQUEST", "Choose a supported request type and enter a valid subject.");
    private static ApiException InvalidState() => new("INVALID_SUPPORT_STATE", "This action is unavailable in the current request state.");
    private static ApiException NotFound() => new("SUPPORT_REQUEST_NOT_FOUND", "Support request was not found.", 404);
    private static ApiException Conflict() => new("SUPPORT_REVISION_CONFLICT", "The request changed. Reload its history before continuing.", 409);
    private static ApiException IdempotencyConflict() => new("SUPPORT_IDEMPOTENCY_CONFLICT", "This command identifier was already used with different content.", 409);
    private sealed record CommandResult(SupportRequestDetailDto Detail, bool AlreadyApplied, Guid EventId);
}
