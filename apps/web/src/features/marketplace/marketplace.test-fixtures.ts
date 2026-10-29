import type { CurrentUser } from "@/lib/movely-api";
import type { MarketplaceDetails } from "@/lib/marketplace-api";
export const verifiedMover: CurrentUser = { id: "mover", firstName: "מוביל", lastName: "בדיקה", email: null, phone: null, phoneVerified: false, role: "Mover", businessId: "business", businessStatus: "Verified", subscriptionStatus: "Inactive", hasCurrentPolicyAcceptance: true };
export const detailFixture: MarketplaceDetails = {
  id: "aaaaaaaa-1111-4111-8111-111111111111", requestType: "ApartmentMove", pickupCity: { code: "4000", name: "חיפה" }, destinationCity: { code: "5000", name: "תל אביב - יפו" }, moveDate: "2026-12-15", publishedAt: "2026-10-29T12:00:00Z", budgetBand: "From2000To3000", numberOfRooms: 3, boxCount: 0, itemCount: 2, leadSalesStatus: "Available",
  pickupAccess: { floor: 0, hasElevator: false, elevatorFurnitureSuitability: "Unknown", parkingDistanceMeters: 0 }, destinationAccess: null, preferredTime: "Morning", dateFlexibility: "Exact",
  items: [{ kind: "ApartmentInventory", apartmentInventoryType: "Sofa", specialItemType: null, smallMoveCategory: null, quantity: 2, lengthCm: 200, widthCm: null, heightCm: null, approximateWeightKg: 50 }], services: { furnitureDisassembly: true, furnitureAssembly: false, packingAssistance: false, packingMaterials: false },
};
