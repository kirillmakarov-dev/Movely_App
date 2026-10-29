using Microsoft.EntityFrameworkCore;
using Movely.Api.Modules.Identity;
using Movely.Api.Shared.Errors;
using Movely.Api.Shared.Time;

namespace Movely.Api.Modules.MoveRequests;

public sealed partial class MoveRequestService
{
    public async Task<RequestPublicationStatusDto> GetPublicationStatusAsync(Guid customerUserId, Guid requestId, CancellationToken cancellationToken = default)
    {
        var checkedAt = _clock.UtcNow;
        var assessment = await RequestPublicationEligibility.Assess(_dbContext, BusinessCalendar.Today(checkedAt))
            .SingleOrDefaultAsync(a => a.Request.Id == requestId && a.Request.CustomerUserId == customerUserId, cancellationToken)
            ?? throw NotFound();
        var legalAvailable = true;
        try { _consentReleaseGate.EnsureAvailable(); }
        catch (ApiException error) when (error.ErrorCode == "LEGAL_NOT_READY") { legalAvailable = false; }
        var blockers = new List<string>();
        if (!assessment.IsActive) blockers.Add("REQUEST_NOT_ACTIVE");
        if (!assessment.SalesOpen) blockers.Add("SALES_UNAVAILABLE");
        if (!assessment.HasPublishedAt) blockers.Add("PUBLICATION_MISSING");
        if (!assessment.RecipientLimitValid) blockers.Add("RECIPIENT_LIMIT_INVALID");
        if (!assessment.OwnerEligible) blockers.Add("CUSTOMER_NOT_ELIGIBLE");
        if (!assessment.PhoneVerified) blockers.Add("PHONE_NOT_VERIFIED");
        if (!assessment.PolicyCurrent) blockers.Add("POLICY_ACCEPTANCE_REQUIRED");
        if (!legalAvailable) blockers.Add("LEGAL_NOT_READY");
        if (!assessment.VersionValid) blockers.Add("REQUEST_VERSION_INVALID");
        if (!assessment.MoveDateValid) blockers.Add("MOVE_DATE_INVALID");
        if (!assessment.ContentComplete) blockers.Add("REQUEST_INCOMPLETE");
        if (!assessment.SharingCurrent && assessment.SharingHistoryConflict) blockers.Add("CONTACT_SHARING_HISTORY_CONFLICT");
        var canRenew = blockers.Count == 0 && !assessment.SharingCurrent;
        if (!assessment.SharingCurrent) blockers.Add("CONTACT_SHARING_REQUIRED");
        var row = assessment.Request;
        return new(row.Id, row.CurrentVersionId, row.Status, row.LeadSalesStatus, row.MaxLeadBuyers,
            ConsentPolicy.Version, ConsentPolicy.IsDraft, checkedAt, blockers.Count == 0, assessment.SharingCurrent,
            assessment.SharingAcceptedAt, canRenew, blockers);
    }

    public async Task<RenewContactSharingResponse> RenewContactSharingAsync(Guid customerUserId, Guid requestId, RenewContactSharingRequest request, CancellationToken cancellationToken = default)
    {
        await using var transaction = _dbContext.Database.IsRelational()
            ? await _dbContext.Database.BeginTransactionAsync(cancellationToken) : null;
        var moveRequest = await _dbContext.MoveRequests.SingleOrDefaultAsync(
            x => x.Id == requestId && x.CustomerUserId == customerUserId, cancellationToken) ?? throw NotFound();
        if (request.ExpectedCurrentVersionId == Guid.Empty || request.ExpectedCurrentVersionId != moveRequest.CurrentVersionId)
            throw VersionConflict();
        await ValidatePublicationConsentAsync(customerUserId, moveRequest, request.ContactSharing, cancellationToken);
        var status = await GetPublicationStatusAsync(customerUserId, requestId, cancellationToken);
        // A concurrent change between the tracked load and diagnostic query cannot authorize a different snapshot.
        if (status.CurrentVersionId != moveRequest.CurrentVersionId || status.MaxRecipients != moveRequest.MaxLeadBuyers)
            throw VersionConflict();
        if (status.Blockers.Contains("CONTACT_SHARING_HISTORY_CONFLICT"))
            throw new ApiException("CONTACT_SHARING_HISTORY_CONFLICT", "The current contact-sharing history requires review before renewal.", 409);
        if (!status.CanRenewContactSharing && !status.EligibleForMarketplace)
            throw new ApiException("PUBLICATION_RENEWAL_UNAVAILABLE", "Contact sharing cannot be renewed until the publication prerequisites are satisfied.");
        var alreadyAccepted = status.HasCurrentContactSharing;
        if (!alreadyAccepted)
            AddContactSharingAcceptance(customerUserId, moveRequest, request.ExpectedCurrentVersionId, _clock.UtcNow);
        // Force an aggregate UPDATE even for fixed clocks or an idempotent retry. Its concurrency
        // predicates protect owner/version/status/recipient limits; content and timestamps stay unchanged.
        _dbContext.Entry(moveRequest).Property(x => x.UpdatedAt).IsModified = true;
        await SaveChangesAsync(cancellationToken);
        var publicationStatus = await GetPublicationStatusAsync(customerUserId, requestId, cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return new(publicationStatus, alreadyAccepted);
    }
}
