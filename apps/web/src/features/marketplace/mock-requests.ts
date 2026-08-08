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
    pickupCity: "Harish",
    destinationCity: "Tel Aviv",
    moveDate: "18 August",
    rooms: 3,
    boxes: 18,
    pickupAccess: "Floor 3, elevator",
    destinationAccess: "Floor 5, elevator",
    budget: "NIS 1,500-2,000",
    photoCount: 4,
    publishedLabel: "12 minutes ago",
    inventory: ["Sofa", "Double bed", "Dining table", "Washing machine"],
    services: ["Furniture disassembly", "Furniture assembly"],
  },
  {
    id: "mock-small-netanya-haifa",
    requestType: "SmallMove",
    pickupCity: "Netanya",
    destinationCity: "Haifa",
    moveDate: "24 August",
    itemName: "Three-seat sofa",
    quantity: 1,
    pickupAccess: "Ground floor",
    destinationAccess: "Floor 2, no elevator",
    budget: "Up to NIS 1,000",
    photoCount: 3,
    publishedLabel: "28 minutes ago",
    inventory: ["Three-seat sofa"],
    services: [],
  },
  {
    id: "mock-apartment-rishon-holon",
    requestType: "ApartmentMove",
    pickupCity: "Rishon LeZion",
    destinationCity: "Holon",
    moveDate: "27 August",
    rooms: 2,
    boxes: 12,
    pickupAccess: "Floor 2, elevator",
    destinationAccess: "Floor 1",
    budget: "NIS 1,000-1,500",
    photoCount: 2,
    publishedLabel: "1 hour ago",
    inventory: ["Bed", "Wardrobe", "Desk"],
    services: ["Packing assistance"],
  },
  {
    id: "mock-small-jerusalem-modiin",
    requestType: "SmallMove",
    pickupCity: "Jerusalem",
    destinationCity: "Modi'in",
    moveDate: "30 August",
    itemName: "Home office equipment",
    quantity: 4,
    pickupAccess: "Floor 4, elevator",
    destinationAccess: "Ground floor",
    budget: "NIS 1,000-1,500",
    photoCount: 5,
    publishedLabel: "2 hours ago",
    inventory: ["Desk", "Office chair", "Monitor", "Boxes"],
    services: [],
  },
  {
    id: "mock-apartment-haifa-kiryat-ata",
    requestType: "ApartmentMove",
    pickupCity: "Haifa",
    destinationCity: "Kiryat Ata",
    moveDate: "2 September",
    rooms: 4,
    boxes: 26,
    pickupAccess: "Floor 1",
    destinationAccess: "Floor 6, freight elevator",
    budget: "NIS 2,000-3,000",
    photoCount: 6,
    publishedLabel: "3 hours ago",
    inventory: ["Living room", "3 bedrooms", "Appliances"],
    services: ["Packing materials"],
  },
  {
    id: "mock-small-ashdod-tel-aviv",
    requestType: "SmallMove",
    pickupCity: "Ashdod",
    destinationCity: "Tel Aviv",
    moveDate: "5 September",
    itemName: "Refrigerator",
    quantity: 1,
    pickupAccess: "Floor 3, elevator",
    destinationAccess: "Floor 2, elevator",
    budget: "Up to NIS 1,000",
    photoCount: 2,
    publishedLabel: "5 hours ago",
    inventory: ["Refrigerator"],
    services: [],
  },
];

export function getMockMarketplaceRequest(id: string) {
  return mockMarketplaceRequests.find((request) => request.id === id);
}
