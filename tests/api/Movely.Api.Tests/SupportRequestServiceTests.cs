using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Movely.Api.Data;
using Movely.Api.Modules.Support;
using Movely.Api.Shared.Errors;

namespace Movely.Api.Tests;

public sealed class SupportRequestServiceTests
{
    [Theory]
    [InlineData(UserRole.Customer, SupportRequestType.General)]
    [InlineData(UserRole.Mover, SupportRequestType.PrivacyAccess)]
    [InlineData(UserRole.Customer, SupportRequestType.PrivacyCorrection)]
    [InlineData(UserRole.Mover, SupportRequestType.PrivacyDeletion)]
    public async Task ActiveOwnersCanSubmitWithoutPhonePolicyOrRightsFulfillment(UserRole role, SupportRequestType type)
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db, role, phone: false, consent: false);
        var service = SupportTestData.Service(db);
        var result = await service.CreateAsync(owner.Id, SupportTestData.Create(owner.Id, type));
        Assert.False(result.AlreadyCreated);
        Assert.Equal(SupportRequestStatus.Open, result.Request.Status);
        Assert.Equal(type, result.Request.Type);
        Assert.NotEqual(Guid.Empty, result.Request.RevisionId);
        var entry = Assert.Single(result.Request.History.Items);
        Assert.Equal(SupportEventKind.Created, entry.Kind);
        Assert.Equal(SupportEventActor.Owner, entry.Actor);
        Assert.Null(entry.PreviousStatus);
        Assert.Equal(1, entry.SequenceNumber);
        Assert.Equal(owner.Id, Assert.Single(db.SupportRequestEvents).ActorUserId);
        Assert.Equal(UserStatus.Active, (await db.Users.FindAsync(owner.Id))!.Status);
        Assert.False(owner.PhoneVerified);
        Assert.Empty(db.PolicyAcceptances);
    }

    [Fact]
    public async Task CreateIdempotencyIsBoundToOwnerAndNormalizedOriginalPayloadAcrossLaterChanges()
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var other = await BusinessTestData.User(db);
        var flags = new SupportTestOptions(true);
        var service = SupportTestData.Service(db, flags);
        var command = SupportTestData.Create(owner.Id);
        var first = await service.CreateAsync(owner.Id, command);
        var cancelled = await service.CancelOwnedAsync(owner.Id, first.Request.Id, new(Guid.NewGuid(), first.Request.RevisionId, owner.Id));
        var separate = await service.CreateAsync(other.Id, command with { ExpectedActorUserId = other.Id });
        Assert.NotEqual(first.Request.Id, separate.Request.Id);
        flags.CurrentValue.RequestsEnabled = false;
        var retry = await service.CreateAsync(owner.Id, command with { Subject = "  " + command.Subject + "  ", Message = "\r\n" + command.Message + "\n" });
        Assert.True(retry.AlreadyCreated);
        Assert.Equal(cancelled.Request.RevisionId, retry.Request.RevisionId);
        Assert.Equal(SupportRequestStatus.Cancelled, retry.Request.Status);
        Assert.Equal(2, await db.SupportRequests.CountAsync());
        await Error("SUPPORT_IDEMPOTENCY_CONFLICT", 409, () => service.CreateAsync(owner.Id, command with { Message = "Different message" }));
        Assert.Equal(first.Request.Id, (await service.FindSubmissionAsync(owner.Id, command.ClientMutationId)).Id);
    }

    [Fact]
    public async Task DisabledModeKeepsReadCancelAndAdminAssignmentButRejectsFreshRepliesAndCreates()
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var admin = await BusinessTestData.User(db, UserRole.Admin);
        var flags = new SupportTestOptions(true);
        var service = SupportTestData.Service(db, flags);
        var created = (await service.CreateAsync(owner.Id, SupportTestData.Create(owner.Id))).Request;
        flags.CurrentValue.RequestsEnabled = false;
        await Error("SUPPORT_REQUESTS_DISABLED", 503, () => service.CreateAsync(owner.Id, SupportTestData.Create(owner.Id)));
        await Error("SUPPORT_REQUESTS_DISABLED", 503, () => service.ReplyOwnedAsync(owner.Id, created.Id, new(Guid.NewGuid(), created.RevisionId, "Owner reply", owner.Id)));
        await Error("SUPPORT_REQUESTS_DISABLED", 503, () => service.ReplyAdminAsync(admin.Id, created.Id, new(Guid.NewGuid(), created.RevisionId, "Visible response", SupportRequestStatus.Resolved, admin.Id)));
        Assert.Single((await service.ListOwnedAsync(owner.Id, new(null, null, 1, 12))).Items);
        var assigned = await service.SetStatusAdminAsync(admin.Id, created.Id, new(Guid.NewGuid(), created.RevisionId, SupportRequestStatus.InReview, admin.Id));
        Assert.Equal(SupportRequestStatus.InReview, assigned.Request.Status);
        Assert.Equal(2, assigned.Request.History.TotalCount);
        var cancelled = await service.CancelOwnedAsync(owner.Id, created.Id, new(Guid.NewGuid(), assigned.Request.RevisionId, owner.Id));
        Assert.Equal(SupportRequestStatus.Cancelled, cancelled.Request.Status);
        Assert.Equal(3, (await service.GetAdminAsync(admin.Id, created.Id, SupportRequestQuery.RecentHistory)).History.TotalCount);
    }

    [Theory]
    [InlineData(SupportRequestStatus.Open, SupportRequestStatus.Open)]
    [InlineData(SupportRequestStatus.InReview, SupportRequestStatus.InReview)]
    [InlineData(SupportRequestStatus.WaitingForUser, SupportRequestStatus.Open)]
    [InlineData(SupportRequestStatus.Resolved, SupportRequestStatus.Open)]
    public async Task OwnerReplyReopensOnlyStatesThatNeedReopeningAndPreservesHistory(SupportRequestStatus previous, SupportRequestStatus expected)
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var admin = await BusinessTestData.User(db, UserRole.Admin);
        var service = SupportTestData.Service(db);
        var created = (await service.CreateAsync(owner.Id, SupportTestData.Create(owner.Id))).Request;
        var addressed = await service.ReplyAdminAsync(admin.Id, created.Id, new(Guid.NewGuid(), created.RevisionId, "Owner-visible answer", previous, admin.Id));
        var command = new SupportReplyRequest(Guid.NewGuid(), addressed.Request.RevisionId, "More details\r\n\tSecond line", owner.Id);
        var reply = await service.ReplyOwnedAsync(owner.Id, created.Id, command);
        Assert.Equal(expected, reply.Request.Status);
        Assert.NotEqual(addressed.Request.RevisionId, reply.Request.RevisionId);
        Assert.Equal(3, reply.Request.History.TotalCount);
        var latest = reply.Request.History.Items[0];
        Assert.Equal(command.Body, latest.Body);
        Assert.Equal(previous, latest.PreviousStatus);
        Assert.Equal(expected, latest.Status);
        Assert.Equal(3, latest.SequenceNumber);
        Assert.Equal(2, reply.Request.History.Items[1].SequenceNumber);
        Assert.Equal("Owner-visible answer", reply.Request.History.Items[1].Body);
    }

    [Fact]
    public async Task ExactReplyRetrySurvivesDisabledFlagAndLaterStatusButChangedCommandIsRejected()
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var flags = new SupportTestOptions(true);
        var service = SupportTestData.Service(db, flags);
        var created = (await service.CreateAsync(owner.Id, SupportTestData.Create(owner.Id))).Request;
        var command = new SupportReplyRequest(Guid.NewGuid(), created.RevisionId, "Additional details", owner.Id);
        var first = await service.ReplyOwnedAsync(owner.Id, created.Id, command);
        var cancelled = await service.CancelOwnedAsync(owner.Id, created.Id, new(Guid.NewGuid(), first.Request.RevisionId, owner.Id));
        flags.CurrentValue.RequestsEnabled = false;
        var retry = await service.ReplyOwnedAsync(owner.Id, created.Id, command);
        Assert.True(retry.AlreadyApplied);
        Assert.Equal(first.EventId, retry.EventId);
        Assert.Equal(cancelled.Request.RevisionId, retry.Request.RevisionId);
        Assert.Equal(SupportRequestStatus.Cancelled, retry.Request.Status);
        Assert.Equal(3, await db.SupportRequestEvents.CountAsync());
        await Error("SUPPORT_IDEMPOTENCY_CONFLICT", 409, () => service.ReplyOwnedAsync(owner.Id, created.Id, command with { Body = "Changed details" }));
        await Error("SUPPORT_IDEMPOTENCY_CONFLICT", 409, () => service.ReplyOwnedAsync(owner.Id, created.Id, command with { ExpectedRevisionId = cancelled.Request.RevisionId }));
        await Error("SUPPORT_IDEMPOTENCY_CONFLICT", 409, () => service.CancelOwnedAsync(owner.Id, created.Id, new(command.ClientMutationId, command.ExpectedRevisionId, owner.Id)));
    }

    [Theory]
    [InlineData("cancel-resolved")]
    [InlineData("reply-cancelled")]
    [InlineData("admin-reply-cancelled")]
    [InlineData("status-cancelled")]
    [InlineData("status-resolved")]
    [InlineData("empty-resolution")]
    [InlineData("admin-cancel")]
    public async Task InvalidTerminalAndResolutionCommandsNeverAppendHistory(string action)
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var admin = await BusinessTestData.User(db, UserRole.Admin);
        var service = SupportTestData.Service(db);
        var created = (await service.CreateAsync(owner.Id, SupportTestData.Create(owner.Id))).Request;
        var row = (await db.SupportRequests.FindAsync(created.Id))!;
        if (action.Contains("cancelled")) row.Status = SupportRequestStatus.Cancelled;
        if (action == "cancel-resolved") row.Status = SupportRequestStatus.Resolved;
        await db.SaveChangesAsync();
        Func<Task> operation = action switch {
            "cancel-resolved" => () => service.CancelOwnedAsync(owner.Id, created.Id, new(Guid.NewGuid(), created.RevisionId, owner.Id)),
            "reply-cancelled" => () => service.ReplyOwnedAsync(owner.Id, created.Id, new(Guid.NewGuid(), created.RevisionId, "Owner reply", owner.Id)),
            "status-cancelled" => () => service.SetStatusAdminAsync(admin.Id, created.Id, new(Guid.NewGuid(), created.RevisionId, SupportRequestStatus.InReview, admin.Id)),
            "status-resolved" => () => service.SetStatusAdminAsync(admin.Id, created.Id, new(Guid.NewGuid(), created.RevisionId, SupportRequestStatus.Resolved, admin.Id)),
            "empty-resolution" => () => service.ReplyAdminAsync(admin.Id, created.Id, new(Guid.NewGuid(), created.RevisionId, " ", SupportRequestStatus.Resolved, admin.Id)),
            _ => () => service.ReplyAdminAsync(admin.Id, created.Id, new(Guid.NewGuid(), created.RevisionId, "Visible answer", action == "admin-cancel" ? SupportRequestStatus.Cancelled : SupportRequestStatus.Resolved, admin.Id)),
        };
        await Error(action == "empty-resolution" ? "INVALID_SUPPORT_MESSAGE" : "INVALID_SUPPORT_STATE", 400, operation);
        Assert.Single(db.SupportRequestEvents);
        Assert.Equal(created.RevisionId, row.RevisionId);
    }

    [Fact]
    public async Task ResolvingPrivacyDeletionIsOnlyAnAuditedResponseAndDoesNotDeleteAccountData()
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var admin = await BusinessTestData.User(db, UserRole.Admin);
        var service = SupportTestData.Service(db);
        var created = (await service.CreateAsync(owner.Id, SupportTestData.Create(owner.Id, SupportRequestType.PrivacyDeletion))).Request;
        var users = await db.Users.CountAsync();
        var policies = await db.PolicyAcceptances.CountAsync();
        var resolved = await service.ReplyAdminAsync(admin.Id, created.Id, new(Guid.NewGuid(), created.RevisionId, "Your request was reviewed; this response does not perform deletion.", SupportRequestStatus.Resolved, admin.Id));
        Assert.Equal(SupportRequestStatus.Resolved, resolved.Request.Status);
        Assert.Equal(users, await db.Users.CountAsync());
        Assert.Equal(policies, await db.PolicyAcceptances.CountAsync());
        Assert.Equal(UserStatus.Active, (await db.Users.FindAsync(owner.Id))!.Status);
        var json = JsonSerializer.Serialize(await service.GetOwnedAsync(owner.Id, created.Id, SupportRequestQuery.RecentHistory), ApiJson.Options);
        Assert.DoesNotContain("actorUserId", json);
        Assert.DoesNotContain(admin.Id.ToString(), json);
        Assert.DoesNotContain("email", json);
        Assert.DoesNotContain("phone", json);
        Assert.Contains("Support", json);
        Assert.Equal(admin.Id, (await db.SupportRequestEvents.SingleAsync(x => x.SequenceNumber == 2)).ActorUserId);
    }

    [Theory]
    [InlineData("subject-control", "INVALID_SUPPORT_REQUEST")]
    [InlineData("subject-long", "INVALID_SUPPORT_REQUEST")]
    [InlineData("body-control", "INVALID_SUPPORT_MESSAGE")]
    [InlineData("body-long", "INVALID_SUPPORT_MESSAGE")]
    [InlineData("body-short", "INVALID_SUPPORT_MESSAGE")]
    [InlineData("type", "INVALID_SUPPORT_REQUEST")]
    [InlineData("missing-type", "INVALID_SUPPORT_REQUEST")]
    [InlineData("mutation", "SUPPORT_MUTATION_ID_REQUIRED")]
    public async Task InvalidCreateInputNeverPersistsARequest(string invalid, string code)
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var request = SupportTestData.Create(owner.Id);
        request = invalid switch {
            "subject-control" => request with { Subject = "Subject\n" },
            "subject-long" => request with { Subject = new string('a', 161) },
            "body-control" => request with { Message = "Message\0" },
            "body-long" => request with { Message = new string('a', 4001) },
            "body-short" => request with { Message = "a" },
            "type" => request with { Type = (SupportRequestType)999 },
            "missing-type" => request with { Type = null },
            _ => request with { ClientMutationId = Guid.Empty },
        };
        await Error(code, 400, () => SupportTestData.Service(db).CreateAsync(owner.Id, request));
        Assert.Empty(db.SupportRequests);
        Assert.Empty(db.SupportRequestEvents);
    }

    [Fact]
    public async Task OwnerScopeAndFreshAdminRoleAreCheckedForReadsWritesAndSubmissionLookup()
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var other = await BusinessTestData.User(db);
        var admin = await BusinessTestData.User(db, UserRole.Admin);
        var service = SupportTestData.Service(db);
        var command = SupportTestData.Create(owner.Id);
        var request = (await service.CreateAsync(owner.Id, command)).Request;
        await Error("SUPPORT_REQUEST_NOT_FOUND", 404, () => service.GetOwnedAsync(other.Id, request.Id, SupportRequestQuery.RecentHistory));
        await Error("SUPPORT_REQUEST_NOT_FOUND", 404, () => service.FindSubmissionAsync(other.Id, command.ClientMutationId));
        await Error("SUPPORT_REQUEST_NOT_FOUND", 404, () => service.ReplyOwnedAsync(other.Id, request.Id, new(Guid.NewGuid(), request.RevisionId, "Attempted reply", other.Id)));
        Assert.Empty((await service.ListOwnedAsync(other.Id, new(null, null, 1, 12))).Items);
        await Error("SUPPORT_OWNER_ROLE_REQUIRED", 403, () => service.CreateAsync(admin.Id, SupportTestData.Create(owner.Id)));
        admin.Role = UserRole.Customer;
        await db.SaveChangesAsync();
        await Error("ADMIN_REQUIRED", 403, () => service.ListAdminAsync(admin.Id, new(null, null, 1, 12)));
        Assert.Single(db.SupportRequestEvents);
    }

    [Fact]
    public async Task HistoryAndListHaveDeterministicPagingWithoutDroppingOlderEvents()
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var service = SupportTestData.Service(db);
        var request = (await service.CreateAsync(owner.Id, SupportTestData.Create(owner.Id))).Request;
        for (var i = 0; i < 4; i++) request = (await service.ReplyOwnedAsync(owner.Id, request.Id, new(Guid.NewGuid(), request.RevisionId, $"Reply number {i}", owner.Id))).Request;
        var first = await service.GetOwnedAsync(owner.Id, request.Id, new(null, null, 1, 2));
        var second = await service.GetOwnedAsync(owner.Id, request.Id, new(null, null, 2, 2));
        var last = await service.GetOwnedAsync(owner.Id, request.Id, new(null, null, 3, 2));
        Assert.Equal(5, first.History.TotalCount);
        Assert.Equal(new[] { 5, 4 }, first.History.Items.Select(x => x.SequenceNumber));
        Assert.Equal(new[] { 3, 2 }, second.History.Items.Select(x => x.SequenceNumber));
        Assert.Equal(1, Assert.Single(last.History.Items).SequenceNumber);
        var privacy = (await service.CreateAsync(owner.Id, SupportTestData.Create(owner.Id, SupportRequestType.PrivacyAccess))).Request;
        var filtered = await service.ListOwnedAsync(owner.Id, new(SupportRequestType.PrivacyAccess, SupportRequestStatus.Open, 1, 1));
        Assert.Equal(privacy.Id, Assert.Single(filtered.Items).Id);
        Assert.Equal(1, filtered.TotalCount);
    }

    private static async Task Error(string code, int status, Func<Task> action)
    {
        var error = await Assert.ThrowsAsync<ApiException>(action);
        Assert.Equal(code, error.ErrorCode);
        Assert.Equal(status, error.StatusCode);
    }
}
