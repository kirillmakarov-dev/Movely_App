using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Movely.Api.Data;
using Movely.Api.Data.Entities;
using Movely.Api.Modules.Businesses;
using Movely.Api.Shared.Errors;

namespace Movely.Api.Tests;

public sealed class BusinessServiceTests
{
    [Theory]
    [InlineData(UserRole.Customer)]
    [InlineData(UserRole.Mover)]
    public async Task ApplicantGetsOnePendingBusinessWithoutChangingPrimaryRole(UserRole role)
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db, role);
        var service = BusinessTestData.Service(db);
        var profile = await service.CreateAsync(owner.Id, BusinessTestData.Profile);
        Assert.Equal(BusinessStatus.PendingVerification, profile.Status);
        Assert.Equal(role, (await db.Users.FindAsync(owner.Id))!.Role);
        Assert.NotEqual(Guid.Empty, profile.RevisionId);
        Assert.NotNull(profile.RepresentativeConfirmedAt);
        Assert.Equal(new[] { "5000", "4000" }, profile.ServiceAreas.Select(x => x.Code));
        Assert.Equal(profile.Status, Assert.Single(db.BusinessVerifications).Status);
        Assert.Empty(db.BusinessReviews);
        await Error("BUSINESS_ALREADY_EXISTS", 409, () => service.CreateAsync(owner.Id, BusinessTestData.Profile));
    }

    [Theory]
    [InlineData("phone", "PHONE_NOT_VERIFIED", 403)]
    [InlineData("policy", "POLICY_ACCEPTANCE_REQUIRED", 403)]
    [InlineData("admin", "BUSINESS_OWNER_ROLE_REQUIRED", 403)]
    [InlineData("suspended", "ACCOUNT_NOT_ACTIVE", 403)]
    [InlineData("legal", "LEGAL_NOT_READY", 503)]
    public async Task ApplicantAndVerificationGatesPreserveExistingData(string gate, string code, int status)
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var admin = await BusinessTestData.User(db, UserRole.Admin);
        var original = await BusinessTestData.Service(db).CreateAsync(owner.Id, BusinessTestData.Profile);
        if (gate == "phone") owner.PhoneVerified = false;
        if (gate == "policy") db.PolicyAcceptances.RemoveRange(db.PolicyAcceptances.Where(x => x.UserId == owner.Id));
        if (gate == "admin") owner.Role = UserRole.Admin;
        if (gate == "suspended") owner.Status = UserStatus.Suspended;
        await db.SaveChangesAsync();
        var service = BusinessTestData.Service(db, gate == "legal" ? new BusinessTestData.BlockLegal() : null);
        await Error(code, status, () => service.UpdateAsync(owner.Id, BusinessTestData.Update(original)));
        await Error(code, status, () => service.ReviewAsync(admin.Id, original.Id, BusinessTestData.Review(original.RevisionId)));
        Assert.Equal(original.RevisionId, (await db.Businesses.FindAsync(original.Id))!.RevisionId);
        Assert.Empty(db.BusinessReviews);
    }

    [Theory]
    [InlineData("name")]
    [InlineData("name-long")]
    [InlineData("registration-short")]
    [InlineData("registration-unicode")]
    [InlineData("address")]
    [InlineData("representative")]
    [InlineData("unknown-area")]
    [InlineData("duplicate-area")]
    [InlineData("empty-area")]
    [InlineData("too-many-areas")]
    [InlineData("control")]
    public async Task ProfileRejectsInvalidDataBeforeCreatingBusiness(string invalid)
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var request = invalid switch {
            "name" => BusinessTestData.Profile with { Name = " " },
            "name-long" => BusinessTestData.Profile with { Name = new string('x', 121) },
            "registration-short" => BusinessTestData.Profile with { RegistrationNumber = "123" },
            "registration-unicode" => BusinessTestData.Profile with { RegistrationNumber = "１２３４５６７８９" },
            "address" => BusinessTestData.Profile with { RegisteredAddress = new string('x', 301) },
            "representative" => BusinessTestData.Profile with { RepresentativeName = "a" },
            "unknown-area" => BusinessTestData.Profile with { ServiceAreaCodes = ["999999"] },
            "duplicate-area" => BusinessTestData.Profile with { ServiceAreaCodes = ["5000", "5000"] },
            "empty-area" => BusinessTestData.Profile with { ServiceAreaCodes = [] },
            "too-many-areas" => BusinessTestData.Profile with { ServiceAreaCodes = Enumerable.Range(0, 21).Select(x => x.ToString()).ToArray() },
            _ => BusinessTestData.Profile with { Name = "Hello\u0000world" },
        };
        await Error("INVALID_BUSINESS_PROFILE", 400, () => BusinessTestData.Service(db).CreateAsync(owner.Id, request));
        Assert.Empty(db.Businesses);
        Assert.Empty(db.BusinessVerifications);
    }

    [Theory]
    [InlineData(BusinessStatus.PendingVerification, BusinessReviewDecision.Verify, BusinessStatus.Verified)]
    [InlineData(BusinessStatus.PendingVerification, BusinessReviewDecision.Reject, BusinessStatus.Rejected)]
    [InlineData(BusinessStatus.Verified, BusinessReviewDecision.Suspend, BusinessStatus.Suspended)]
    [InlineData(BusinessStatus.Rejected, BusinessReviewDecision.Reopen, BusinessStatus.PendingVerification)]
    [InlineData(BusinessStatus.Suspended, BusinessReviewDecision.Reopen, BusinessStatus.PendingVerification)]
    public async Task AllowedReviewChangesStatusAndPreservesExactImmutableSnapshot(BusinessStatus previous, BusinessReviewDecision decision, BusinessStatus expected)
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var admin = await BusinessTestData.User(db, UserRole.Admin);
        var service = BusinessTestData.Service(db);
        var original = await service.CreateAsync(owner.Id, BusinessTestData.Profile);
        var business = (await db.Businesses.FindAsync(original.Id))!;
        business.Status = previous;
        await db.SaveChangesAsync();
        var result = await service.ReviewAsync(admin.Id, original.Id, BusinessTestData.Review(original.RevisionId, decision));
        Assert.Equal(expected, result.Status);
        Assert.NotEqual(original.RevisionId, result.RevisionId);
        var audit = Assert.Single(db.BusinessReviews);
        Assert.Equal(previous, audit.PreviousStatus);
        Assert.Equal(expected, audit.Status);
        Assert.Equal(original.RevisionId, audit.ProfileRevisionId);
        Assert.Equal(admin.Id, audit.ReviewedByUserId);
        using var snapshot = JsonDocument.Parse(audit.ProfileSnapshotJson);
        Assert.Equal(original.Name, snapshot.RootElement.GetProperty("name").GetString());
        Assert.Equal(original.RevisionId, snapshot.RootElement.GetProperty("revisionId").GetGuid());
        Assert.Equal(new[] { "name", "registeredAddress", "registrationNumber", "representativeConfirmedAt", "representativeName", "revisionId", "serviceAreaCodes" }, snapshot.RootElement.EnumerateObject().Select(x => x.Name).Order());
        Assert.Equal(expected, Assert.Single(db.BusinessVerifications).Status);
        Assert.Equal(UserRole.Customer, owner.Role);
        Assert.Equal(expected, (await service.GetMineAsync(owner.Id)).LatestReview!.Status);
    }

    [Theory]
    [InlineData(BusinessStatus.PendingVerification, BusinessReviewDecision.Suspend)]
    [InlineData(BusinessStatus.PendingVerification, BusinessReviewDecision.Reopen)]
    [InlineData(BusinessStatus.Verified, BusinessReviewDecision.Verify)]
    [InlineData(BusinessStatus.Verified, BusinessReviewDecision.Reject)]
    [InlineData(BusinessStatus.Verified, BusinessReviewDecision.Reopen)]
    [InlineData(BusinessStatus.Rejected, BusinessReviewDecision.Verify)]
    [InlineData(BusinessStatus.Rejected, BusinessReviewDecision.Reject)]
    [InlineData(BusinessStatus.Rejected, BusinessReviewDecision.Suspend)]
    [InlineData(BusinessStatus.Suspended, BusinessReviewDecision.Verify)]
    [InlineData(BusinessStatus.Suspended, BusinessReviewDecision.Reject)]
    [InlineData(BusinessStatus.Suspended, BusinessReviewDecision.Suspend)]
    public async Task InvalidReviewTransitionsHaveNoEffects(BusinessStatus status, BusinessReviewDecision decision)
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var admin = await BusinessTestData.User(db, UserRole.Admin);
        var service = BusinessTestData.Service(db);
        var original = await service.CreateAsync(owner.Id, BusinessTestData.Profile);
        var business = (await db.Businesses.FindAsync(original.Id))!;
        business.Status = status;
        await db.SaveChangesAsync();
        await Error("INVALID_BUSINESS_STATE", 400, () => service.ReviewAsync(admin.Id, original.Id, BusinessTestData.Review(original.RevisionId, decision)));
        Assert.Equal(status, business.Status);
        Assert.Equal(original.RevisionId, business.RevisionId);
        Assert.Empty(db.BusinessReviews);
    }

    [Fact]
    public async Task EditingVerifiedProfileRequiresAcknowledgementAndKeepsLastAuditPrivate()
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var admin = await BusinessTestData.User(db, UserRole.Admin);
        var service = BusinessTestData.Service(db);
        var original = await service.CreateAsync(owner.Id, BusinessTestData.Profile);
        var verified = await service.ReviewAsync(admin.Id, original.Id, BusinessTestData.Review(original.RevisionId));
        var snapshot = Assert.Single(db.BusinessReviews).ProfileSnapshotJson;
        await Error("REVERIFICATION_CONFIRMATION_REQUIRED", 400, () => service.UpdateAsync(owner.Id, BusinessTestData.Update(verified)));
        var updated = await service.UpdateAsync(owner.Id, BusinessTestData.Update(verified, true));
        Assert.Equal(BusinessStatus.PendingVerification, updated.Status);
        Assert.NotEqual(verified.RevisionId, updated.RevisionId);
        Assert.Equal(BusinessStatus.Verified, updated.LatestReview!.Status);
        Assert.Equal(snapshot, Assert.Single(db.BusinessReviews).ProfileSnapshotJson);
        Assert.Equal(BusinessStatus.PendingVerification, Assert.Single(db.BusinessVerifications).Status);
        var json = JsonSerializer.Serialize(updated, ApiJson.Options);
        Assert.DoesNotContain("internalNotes", json);
        Assert.DoesNotContain("profileSnapshot", json);
        Assert.DoesNotContain("reviewedByUserId", json);
        Assert.DoesNotContain(admin.Id.ToString(), json);
        await Error("BUSINESS_REVISION_CONFLICT", 409, () => service.ReviewAsync(admin.Id, original.Id, BusinessTestData.Review(verified.RevisionId)));
        var reverified = await service.ReviewAsync(admin.Id, original.Id, BusinessTestData.Review(updated.RevisionId));
        Assert.Equal(2, reverified.Reviews.Count);
        Assert.Equal(2, await db.BusinessReviews.CountAsync());
    }

    [Fact]
    public async Task SuspendedBusinessCannotEditAndOtherOwnerCannotReadOrChangeIt()
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var other = await BusinessTestData.User(db);
        var service = BusinessTestData.Service(db);
        var original = await service.CreateAsync(owner.Id, BusinessTestData.Profile);
        (await db.Businesses.FindAsync(original.Id))!.Status = BusinessStatus.Suspended;
        await db.SaveChangesAsync();
        await Error("BUSINESS_SUSPENDED", 403, () => service.UpdateAsync(owner.Id, BusinessTestData.Update(original, true)));
        await Error("BUSINESS_NOT_FOUND", 404, () => service.GetMineAsync(other.Id));
        await Error("BUSINESS_NOT_FOUND", 404, () => service.UpdateAsync(other.Id, BusinessTestData.Update(original, true)));
    }

    [Fact]
    public async Task AdministratorCannotSelfReviewAndRoleRevocationIsCheckedFromDatabase()
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var service = BusinessTestData.Service(db);
        var original = await service.CreateAsync(owner.Id, BusinessTestData.Profile);
        owner.Role = UserRole.Admin;
        await db.SaveChangesAsync();
        await Error("SELF_REVIEW_FORBIDDEN", 403, () => service.ReviewAsync(owner.Id, original.Id, BusinessTestData.Review(original.RevisionId)));
        owner.Role = UserRole.Customer;
        await db.SaveChangesAsync();
        await Error("ADMIN_REQUIRED", 403, () => service.ListAsync(owner.Id, new(null, 1, 12)));
        await Error("ADMIN_REQUIRED", 403, () => service.GetAsync(owner.Id, original.Id));
        await Error("ADMIN_REQUIRED", 403, () => service.ReviewAsync(owner.Id, original.Id, BusinessTestData.Review(original.RevisionId)));
        Assert.Empty(db.BusinessReviews);
    }

    [Fact]
    public async Task LegacyVerifiedProfileIsReadableAndIncompletePendingProfileCannotBeApproved()
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var admin = await BusinessTestData.User(db, UserRole.Admin);
        var business = new Business { Id = Guid.NewGuid(), OwnerUserId = owner.Id, Name = "Legacy", Status = BusinessStatus.Verified, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
        db.Businesses.Add(business);
        await db.SaveChangesAsync();
        var service = BusinessTestData.Service(db);
        var result = await service.GetMineAsync(owner.Id);
        Assert.Equal(BusinessStatus.Verified, result.Status);
        Assert.Null(result.RegisteredAddress);
        Assert.Null(result.LatestReview);
        Assert.Empty(result.ServiceAreas);
        business.Status = BusinessStatus.PendingVerification;
        await db.SaveChangesAsync();
        var error = await Assert.ThrowsAsync<ApiException>(() => service.ReviewAsync(admin.Id, business.Id, BusinessTestData.Review(business.RevisionId)));
        Assert.Equal(400, error.StatusCode);
        Assert.Empty(db.BusinessReviews);
    }

    [Theory]
    [InlineData("registry")]
    [InlineData("representative")]
    [InlineData("notes")]
    [InlineData("reason")]
    [InlineData("enum")]
    [InlineData("decision")]
    [InlineData("revision")]
    [InlineData("confirmation")]
    public async Task ExplicitChecksReasonsAndRevisionAreRequired(string missing)
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var admin = await BusinessTestData.User(db, UserRole.Admin);
        var service = BusinessTestData.Service(db);
        if (missing == "confirmation") {
            await Error("REPRESENTATIVE_CONFIRMATION_REQUIRED", 400, () => service.CreateAsync(owner.Id, BusinessTestData.Profile with { AuthorizedRepresentative = false }));
            return;
        }
        var original = await service.CreateAsync(owner.Id, BusinessTestData.Profile);
        var request = BusinessTestData.Review(original.RevisionId);
        request = missing switch {
            "registry" => request with { RegistryChecked = false },
            "representative" => request with { RepresentativeChecked = false },
            "notes" => request with { InternalNotes = "yes" },
            "reason" => request with { Decision = BusinessReviewDecision.Reject, OwnerMessage = " " },
            "enum" => request with { Decision = (BusinessReviewDecision)99 },
            "decision" => request with { Decision = null },
            _ => request with { ExpectedRevisionId = Guid.Empty },
        };
        await Error(missing == "revision" ? "EXPECTED_REVISION_REQUIRED" : "INVALID_BUSINESS_REVIEW", 400, () => service.ReviewAsync(admin.Id, original.Id, request));
        Assert.Empty(db.BusinessReviews);
    }

    [Fact]
    public async Task AdminHistoryIsBoundedWithExplicitOverflowFlagAndAllRowsRemainStored()
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var admin = await BusinessTestData.User(db, UserRole.Admin);
        var service = BusinessTestData.Service(db);
        var profile = await service.CreateAsync(owner.Id, BusinessTestData.Profile);
        var timestamp = DateTimeOffset.UtcNow;
        for (var i = 0; i < 101; i++) db.BusinessReviews.Add(new BusinessReview {
            Id = Guid.NewGuid(), BusinessId = profile.Id, ProfileRevisionId = Guid.NewGuid(), ReviewedByUserId = admin.Id,
            PreviousStatus = BusinessStatus.PendingVerification, Status = BusinessStatus.Rejected, ReviewedAt = timestamp.AddSeconds(i),
            OwnerMessage = "Reason", InternalNotes = "Private notes", ProfileSnapshotJson = "{}",
        });
        await db.SaveChangesAsync();
        var detail = await service.GetAsync(admin.Id, profile.Id);
        Assert.True(detail.HasMoreReviews);
        Assert.Equal(100, detail.Reviews.Count);
        Assert.Equal(timestamp.AddSeconds(100), detail.Reviews[0].ReviewedAt);
        Assert.Equal(timestamp.AddSeconds(1), detail.Reviews[^1].ReviewedAt);
        Assert.Equal(101, await db.BusinessReviews.CountAsync());
    }

    [Theory]
    [InlineData(true, "\0")]
    [InlineData(false, "\0")]
    [InlineData(true, "\u001b")]
    [InlineData(false, "\u001b")]
    [InlineData(true, "\v")]
    [InlineData(false, "\v")]
    [InlineData(true, "\u0085")]
    [InlineData(false, "\u0085")]
    public async Task ReviewControlCharactersReturn400WithoutChangingStatusOrAudit(bool ownerMessage, string unsupported)
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var admin = await BusinessTestData.User(db, UserRole.Admin);
        var service = BusinessTestData.Service(db);
        var original = await service.CreateAsync(owner.Id, BusinessTestData.Profile);
        var request = BusinessTestData.Review(original.RevisionId);
        request = ownerMessage
            ? request with { OwnerMessage = "Visible reason" + unsupported }
            : request with { InternalNotes = "Registry checked manually" + unsupported };

        await Error("INVALID_BUSINESS_REVIEW", 400, () => service.ReviewAsync(admin.Id, original.Id, request));

        var saved = (await db.Businesses.FindAsync(original.Id))!;
        Assert.Equal(original.RevisionId, saved.RevisionId);
        Assert.Equal(BusinessStatus.PendingVerification, saved.Status);
        var mirror = Assert.Single(db.BusinessVerifications);
        Assert.Equal(BusinessStatus.PendingVerification, mirror.Status);
        Assert.Null(mirror.ReviewedAt);
        Assert.Null(mirror.Notes);
        Assert.Null(mirror.OwnerMessage);
        Assert.Empty(db.BusinessReviews);
    }

    [Fact]
    public async Task MultilineReviewTextPreservesCrLfAndTabs()
    {
        await using var db = BusinessTestData.Memory();
        var owner = await BusinessTestData.User(db);
        var admin = await BusinessTestData.User(db, UserRole.Admin);
        var service = BusinessTestData.Service(db);
        var original = await service.CreateAsync(owner.Id, BusinessTestData.Profile);
        const string ownerMessage = "First reason\r\n\tSecond line\nThird line";
        const string notes = "Registry checked\r\n\tRepresentative checked\nReview completed";
        var reviewed = await service.ReviewAsync(admin.Id, original.Id, BusinessTestData.Review(original.RevisionId) with {
            OwnerMessage = ownerMessage, InternalNotes = notes,
        });

        Assert.Equal(BusinessStatus.Verified, reviewed.Status);
        var audit = Assert.Single(db.BusinessReviews);
        Assert.Equal(ownerMessage, audit.OwnerMessage);
        Assert.Equal(notes, audit.InternalNotes);
        Assert.Equal(notes, Assert.Single(db.BusinessVerifications).Notes);
        Assert.Equal(ownerMessage, (await service.GetMineAsync(owner.Id)).LatestReview!.OwnerMessage);
    }

    private static async Task Error(string code, int status, Func<Task> action)
    {
        var error = await Assert.ThrowsAsync<ApiException>(action);
        Assert.Equal(code, error.ErrorCode);
        Assert.Equal(status, error.StatusCode);
    }
}
