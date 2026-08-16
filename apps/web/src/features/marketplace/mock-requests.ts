import type { MoveRequestType } from "@/lib/movely-api";

export const MARKETPLACE_DATA_SOURCE = "development-mock" as const;

export type MarketplaceRequest = {
  id: string;
  requestType: MoveRequestType;
  pickupCity: string;
  destinationCity: string;
  moveDate: string;
  budget: string;
  publishedLabel: string;
  rooms?: number;
  boxes?: number;
  pickupAccess?: string;
  destinationAccess?: string;
  itemName?: string;
  quantity?: number;
  photoCount: number;
  inventory: string[];
  services: string[];
};

// Presentation-only data until the Phase 5 marketplace-safe API is available.
export const mockMarketplaceRequests: MarketplaceRequest[] = [
  {
    id: "mock-apartment-harish-tel-aviv",
    requestType: "ApartmentMove",
    pickupCity: "חריש",
    destinationCity: "תל אביב",
    moveDate: "18 באוגוסט",
    rooms: 3,
    boxes: 18,
    pickupAccess: "קומה 3, עם מעלית",
    destinationAccess: "קומה 5, עם מעלית",
    budget: "1,500-2,000 ₪",
    photoCount: 4,
    publishedLabel: "לפני 12 דקות",
    inventory: ["ספה", "מיטה זוגית", "שולחן אוכל", "מכונת כביסה"],
    services: ["פירוק רהיטים", "הרכבת רהיטים"],
  },
  {
    id: "mock-small-netanya-haifa",
    requestType: "SmallMove",
    pickupCity: "נתניה",
    destinationCity: "חיפה",
    moveDate: "24 באוגוסט",
    itemName: "ספה תלת-מושבית",
    quantity: 1,
    pickupAccess: "קומת קרקע",
    destinationAccess: "קומה 2, ללא מעלית",
    budget: "עד 1,000 ₪",
    photoCount: 3,
    publishedLabel: "לפני 28 דקות",
    inventory: ["ספה תלת-מושבית"],
    services: [],
  },
  {
    id: "mock-apartment-rishon-holon",
    requestType: "ApartmentMove",
    pickupCity: "ראשון לציון",
    destinationCity: "חולון",
    moveDate: "27 באוגוסט",
    rooms: 2,
    boxes: 12,
    pickupAccess: "קומה 2, עם מעלית",
    destinationAccess: "קומה 1",
    budget: "1,000-1,500 ₪",
    photoCount: 2,
    publishedLabel: "לפני שעה",
    inventory: ["מיטה", "ארון", "שולחן עבודה"],
    services: ["סיוע באריזה"],
  },
  {
    id: "mock-small-jerusalem-modiin",
    requestType: "SmallMove",
    pickupCity: "ירושלים",
    destinationCity: "מודיעין",
    moveDate: "30 באוגוסט",
    itemName: "ציוד משרד ביתי",
    quantity: 4,
    pickupAccess: "קומה 4, עם מעלית",
    destinationAccess: "קומת קרקע",
    budget: "1,000-1,500 ₪",
    photoCount: 5,
    publishedLabel: "לפני שעתיים",
    inventory: ["שולחן עבודה", "כיסא משרדי", "מסך", "ארגזים"],
    services: [],
  },
  {
    id: "mock-apartment-haifa-kiryat-ata",
    requestType: "ApartmentMove",
    pickupCity: "חיפה",
    destinationCity: "קריית אתא",
    moveDate: "2 בספטמבר",
    rooms: 4,
    boxes: 26,
    pickupAccess: "קומה 1",
    destinationAccess: "קומה 6, מעלית משא",
    budget: "2,000-3,000 ₪",
    photoCount: 6,
    publishedLabel: "לפני 3 שעות",
    inventory: ["סלון", "3 חדרי שינה", "מכשירי חשמל"],
    services: ["חומרי אריזה"],
  },
  {
    id: "mock-small-ashdod-tel-aviv",
    requestType: "SmallMove",
    pickupCity: "אשדוד",
    destinationCity: "תל אביב",
    moveDate: "5 בספטמבר",
    itemName: "מקרר",
    quantity: 1,
    pickupAccess: "קומה 3, עם מעלית",
    destinationAccess: "קומה 2, עם מעלית",
    budget: "עד 1,000 ₪",
    photoCount: 2,
    publishedLabel: "לפני 5 שעות",
    inventory: ["מקרר"],
    services: [],
  },
];

export function getMockMarketplaceRequest(id: string) {
  return mockMarketplaceRequests.find((request) => request.id === id);
}
