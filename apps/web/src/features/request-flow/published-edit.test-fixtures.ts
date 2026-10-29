import type { CurrentUser } from "@/lib/movely-api";
import type { EditableRequest, PublishedEditContext } from "@/lib/published-request-api";
import { LEGAL_DRAFT_VERSION } from "@/lib/legal-content";
export const editId = "aaaaaaaa-1111-4111-8111-111111111111";
export const versionId = "bbbbbbbb-1111-4111-8111-111111111111";
export const nextVersionId = "cccccccc-1111-4111-8111-111111111111";
export const editUser: CurrentUser = { id: "owner", firstName: "נועה", lastName: "לוי", email: "owner@example.com", phone: "0501234567", phoneVerified: true, role: "Customer", businessId: null, businessStatus: null, subscriptionStatus: null, hasCurrentPolicyAcceptance: true };
export function editRequest(): EditableRequest {
  return {
    id: editId, customerUserId: editUser.id, requestType: "ApartmentMove", status: "Active", leadSalesStatus: "SoldOut", duplicateRisk: false,
    leadPrice: { amountMinor: 5000, currency: "ILS" }, maxLeadBuyers: 7, activeBuyerCount: 7,
    createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", publishedAt: "2026-10-02T10:00:00Z", closedAt: null, cancelledAt: null, expiredAt: null,
    currentVersion: {
      id: versionId, moveRequestId: editId, versionNumber: 3, requestType: "ApartmentMove", createdByUserId: editUser.id, createdAt: "2026-10-02T10:00:00Z",
      pickup: { city: "חיפה", exactAddress: "כתובת פרטית 1", floor: 2, hasElevator: true, elevatorFurnitureSuitability: "Yes", stairsInfo: "מדרגות צד", truckAccessInfo: "כניסה אחורית", parkingDistanceMeters: 15 },
      destination: { city: "תל אביב - יפו", exactAddress: "כתובת פרטית 2", floor: 0, hasElevator: false, elevatorFurnitureSuitability: "Unknown", stairsInfo: null, truckAccessInfo: null, parkingDistanceMeters: 0 },
      apartmentMove: { numberOfRooms: 3, boxes: { small: 2, medium: 1, large: 0 }, inventoryItems: [{ kind: "ApartmentInventory", apartmentInventoryType: "Sofa", specialItemType: null, smallMoveCategory: null, name: null, description: "בד עדין", quantity: 2, lengthCm: 220, widthCm: 90, heightCm: 80, approximateWeightKg: 60 }], additionalServices: { furnitureDisassembly: true, furnitureAssembly: false, packingAssistance: true, packingMaterials: false } },
      smallMoveItems: [], specialItems: [{ kind: "SpecialItem", apartmentInventoryType: null, specialItemType: "Piano", smallMoveCategory: null, name: null, description: "פסנתר פרטי", quantity: 1, lengthCm: 140, widthCm: 50, heightCm: 110, approximateWeightKg: 90 }],
      schedule: { moveDate: "2099-12-20", preferredTime: "Morning", dateFlexibility: "Exact" }, budgetBand: "From1000To1500", customerComment: "הערה מקורית",
      photos: [{ objectKey: "private/secret-object", originalFileName: "private-name.jpg", contentType: "image/jpeg", sizeBytes: 100, displayOrder: 1 }],
    },
  };
}
export function editContext(): PublishedEditContext {
  return { user: { ...editUser }, request: editRequest(), capabilities: { policyAcceptanceAvailable: true, googleSignInAvailable: true, googleClientId: "test.apps.googleusercontent.com", phoneVerificationAvailable: true },
    publication: { requestId: editId, currentVersionId: versionId, requestStatus: "Active", leadSalesStatus: "SoldOut", maxRecipients: 7, disclosureVersion: LEGAL_DRAFT_VERSION, isTestOnly: true, checkedAt: "2026-10-29T10:00:00Z", eligibleForMarketplace: false, hasCurrentContactSharing: true, contactSharingAcceptedAt: "2026-10-02T10:00:00Z", canRenewContactSharing: false, blockers: ["MOVE_DATE_INVALID"] } };
}
