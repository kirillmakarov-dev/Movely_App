import type {
  ApartmentInventoryItemType,
  MoveBudgetBand,
  MoveDateFlexibility,
  MoveItemKind,
  MoveRequestType,
  PreferredMoveTime,
  SmallMoveItemCategory,
  SpecialItemType,
} from "@/lib/movely-api";

export const MOVE_TYPE_OPTIONS: Array<{
  value: MoveRequestType;
  title: string;
  description: string;
}> = [
  {
    value: "ApartmentMove",
    title: "Apartment Move",
    description: "Full home or apartment relocation with route, access, inventory, and services.",
  },
  {
    value: "SmallMove",
    title: "Small Move / Individual Items",
    description: "A sofa, appliance, boxes, electronics, equipment, or a few items together.",
  },
];

export const ROOM_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

export const BOX_TYPE_OPTIONS: Array<{ key: "small" | "medium" | "large"; label: string }> = [
  { key: "small", label: "Small boxes" },
  { key: "medium", label: "Medium boxes" },
  { key: "large", label: "Large boxes" },
];

export const PREFERRED_TIME_OPTIONS: Array<{ value: PreferredMoveTime; label: string }> = [
  { value: "Morning", label: "Morning" },
  { value: "Afternoon", label: "Afternoon" },
  { value: "Evening", label: "Evening" },
  { value: "Flexible", label: "Flexible" },
];

export const DATE_FLEXIBILITY_OPTIONS: Array<{ value: MoveDateFlexibility; label: string }> = [
  { value: "Exact", label: "Exact date" },
  { value: "PlusMinusOneDay", label: "± 1 day" },
  { value: "PlusMinusThreeDays", label: "± 3 days" },
  { value: "WithinOneWeek", label: "Within one week" },
];

export const BUDGET_OPTIONS: Array<{ value: MoveBudgetBand; label: string }> = [
  { value: "UpTo1000", label: "Up to ₪1,000" },
  { value: "From1000To1500", label: "₪1,000 - ₪1,500" },
  { value: "From1500To2000", label: "₪1,500 - ₪2,000" },
  { value: "From2000To3000", label: "₪2,000 - ₪3,000" },
  { value: "From3000To5000", label: "₪3,000 - ₪5,000" },
  { value: "From5000Plus", label: "₪5,000+" },
  { value: "Unknown", label: "I do not know yet" },
];

export const APARTMENT_INVENTORY_OPTIONS: Array<{
  value: ApartmentInventoryItemType;
  label: string;
  hint: string;
}> = [
  { value: "Sofa", label: "Sofa", hint: "Sectional, corner, or sleeper sofa" },
  { value: "Bed", label: "Bed", hint: "Frame, headboard, and base" },
  { value: "Mattress", label: "Mattress", hint: "Single, double, queen, or king" },
  { value: "Wardrobe", label: "Wardrobe", hint: "Freestanding wardrobe or closet unit" },
  { value: "Dresser", label: "Dresser", hint: "Drawer chest or bedroom dresser" },
  { value: "Table", label: "Table", hint: "Dining, coffee, or side table" },
  { value: "Chair", label: "Chair", hint: "Dining chairs, office chairs, stools" },
  { value: "Refrigerator", label: "Refrigerator", hint: "Fridge or freezer" },
  { value: "WashingMachine", label: "Washing machine", hint: "Washer and laundry unit" },
  { value: "Dryer", label: "Dryer", hint: "Drying machine" },
  { value: "Oven", label: "Oven", hint: "Oven or cooking appliance" },
  { value: "Television", label: "Television", hint: "TV and display equipment" },
  { value: "Desk", label: "Desk", hint: "Desk, workstation, or gaming setup" },
  { value: "Bookshelf", label: "Bookshelf", hint: "Shelving or bookcase" },
  { value: "Custom", label: "Custom item", hint: "A unique item that needs extra detail" },
];

export const SPECIAL_ITEM_OPTIONS: Array<{ value: SpecialItemType; label: string }> = [
  { value: "Piano", label: "Piano" },
  { value: "Safe", label: "Safe" },
  { value: "OversizedRefrigerator", label: "Oversized fridge" },
  { value: "Glass", label: "Glass" },
  { value: "Artwork", label: "Artwork" },
  { value: "Antique", label: "Antique" },
  { value: "HeavyObject", label: "Heavy object" },
  { value: "FragileEquipment", label: "Fragile equipment" },
  { value: "Other", label: "Other special item" },
];

export const SMALL_MOVE_CATEGORIES: Array<{ value: SmallMoveItemCategory; label: string }> = [
  { value: "Furniture", label: "Furniture" },
  { value: "Electronics", label: "Electronics" },
  { value: "Appliance", label: "Appliance" },
  { value: "Boxes", label: "Boxes" },
  { value: "Equipment", label: "Equipment" },
  { value: "Other", label: "Other" },
];

export const SMALL_MOVE_ITEM_KIND: MoveItemKind = "SmallMoveItem";
export const APARTMENT_INVENTORY_KIND: MoveItemKind = "ApartmentInventory";
export const SPECIAL_ITEM_KIND: MoveItemKind = "SpecialItem";

