using Movely.Api.Data;
using Movely.Api.Modules.Identity;

namespace Movely.Api.Modules.MoveRequests;

public sealed record RequestPublicationStatusDto(
    Guid RequestId, Guid? CurrentVersionId, MoveRequestStatus RequestStatus, LeadSalesStatus LeadSalesStatus,
    int MaxRecipients, string DisclosureVersion, bool IsTestOnly, DateTimeOffset CheckedAt,
    bool EligibleForMarketplace, bool HasCurrentContactSharing, DateTimeOffset? ContactSharingAcceptedAt,
    bool CanRenewContactSharing, IReadOnlyList<string> Blockers);
public sealed record RenewContactSharingRequest(Guid ExpectedCurrentVersionId, ContactSharingRequest? ContactSharing);
public sealed record RenewContactSharingResponse(RequestPublicationStatusDto PublicationStatus, bool AlreadyAccepted);
