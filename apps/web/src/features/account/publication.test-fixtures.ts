import { LEGAL_DRAFT_VERSION } from "@/lib/legal-content";
import type { RequestPublicationStatus } from "@/lib/request-publication-api";
import type { MoveRequestResponse } from "@/lib/movely-api";
export const publication: RequestPublicationStatus = { requestId: "aaaaaaaa-1111-4111-8111-111111111111", currentVersionId: "bbbbbbbb-1111-4111-8111-111111111111", requestStatus: "Active", leadSalesStatus: "Available", maxRecipients: 7, disclosureVersion: LEGAL_DRAFT_VERSION, isTestOnly: true, checkedAt: "2026-10-29T12:00:00Z", eligibleForMarketplace: false, hasCurrentContactSharing: false, contactSharingAcceptedAt: null, canRenewContactSharing: true, blockers: ["CONTACT_SHARING_REQUIRED"] };
export const acceptedPublication: RequestPublicationStatus = { ...publication, eligibleForMarketplace: true, hasCurrentContactSharing: true, contactSharingAcceptedAt: publication.checkedAt, canRenewContactSharing: false, blockers: [] };
export const publicationOwnerRequest: MoveRequestResponse = {
  id: publication.requestId, customerUserId: "cccccccc-1111-4111-8111-111111111111", requestType: "SmallMove", status: "Active", leadSalesStatus: "Available", duplicateRisk: false, leadPrice: { currency: "ILS", amountMinor: 0 }, maxLeadBuyers: 7, activeBuyerCount: 0,
  createdAt: publication.checkedAt, updatedAt: publication.checkedAt, publishedAt: publication.checkedAt, closedAt: null, cancelledAt: null, expiredAt: null,
  currentVersion: { id: publication.currentVersionId!, moveRequestId: publication.requestId, versionNumber: 1, createdByUserId: "cccccccc-1111-4111-8111-111111111111", createdAt: publication.checkedAt, requestType: "SmallMove",
    pickup: { city: "חיפה", exactAddress: "כתובת פרטית 17", floor: 0, hasElevator: false, elevatorFurnitureSuitability: "Unknown", stairsInfo: null, truckAccessInfo: null, parkingDistanceMeters: null },
    destination: { city: "תל אביב", exactAddress: "כתובת יעד פרטית 22", floor: 2, hasElevator: true, elevatorFurnitureSuitability: "Yes", stairsInfo: null, truckAccessInfo: null, parkingDistanceMeters: null },
    apartmentMove: null, smallMoveItems: [{ kind: "SmallMoveItem", apartmentInventoryType: null, specialItemType: null, smallMoveCategory: "Furniture", name: "שולחן", description: null, quantity: 1, lengthCm: null, widthCm: null, heightCm: null, approximateWeightKg: null }], specialItems: [], schedule: { moveDate: "2026-12-15", preferredTime: "Morning", dateFlexibility: "Exact" }, budgetBand: null, customerComment: "הערה פרטית", photos: [],
  },
};
