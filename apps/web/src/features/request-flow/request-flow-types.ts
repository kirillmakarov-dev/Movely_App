import type { MoveRequestType, MoveLocationDto, ApartmentInventoryItemType, SmallMoveItemCategory, SpecialItemType, PreferredMoveTime, MoveDateFlexibility, MoveBudgetBand } from "@/lib/movely-api";

type PendingPhoto = {
  id: string;
  name: string;
  sizeLabel: string;
};

type LocalInventoryItem = {
  id: string;
  apartmentInventoryType: ApartmentInventoryItemType;
  name: string;
  description: string;
  quantity: number;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  approximateWeightKg: string;
};

type LocalSmallMoveItem = {
  id: string;
  smallMoveCategory: SmallMoveItemCategory;
  name: string;
  description: string;
  quantity: number;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  approximateWeightKg: string;
};

type LocalSpecialItem = {
  id: string;
  specialItemType: SpecialItemType;
  name: string;
  description: string;
  quantity: number;
};

export type FormState = {
  requestType: MoveRequestType | null;
  pickup: MoveLocationDto;
  destination: MoveLocationDto;
  apartmentRooms: number | null;
  smallBoxes: number;
  mediumBoxes: number;
  largeBoxes: number;
  apartmentInventory: LocalInventoryItem[];
  specialItems: LocalSpecialItem[];
  smallMoveItems: LocalSmallMoveItem[];
  furnitureDisassembly: boolean;
  furnitureAssembly: boolean;
  packingAssistance: boolean;
  packingMaterials: boolean;
  moveDate: string;
  preferredTime: PreferredMoveTime | null;
  dateFlexibility: MoveDateFlexibility | null;
  budgetBand: MoveBudgetBand | null;
  customerComment: string;
  pendingPhotos: PendingPhoto[];
};
