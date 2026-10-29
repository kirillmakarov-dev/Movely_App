import { MOVELY_API_BASE_URL, MovelyApiError, type ApartmentInventoryItemType, type ElevatorFurnitureSuitability, type MoveBudgetBand, type MoveDateFlexibility, type MoveItemKind, type MoveRequestType, type PreferredMoveTime, type SmallMoveItemCategory, type SpecialItemType } from "./movely-api";

export const marketplaceBudgets = ["UpTo1000", "From1000To1500", "From1500To2000", "From2000To3000", "From3000To5000", "From5000Plus", "Unknown"] as const;
export type MarketplaceFilters = { requestType?: MoveRequestType; pickupCityCode?: string; destinationCityCode?: string; moveDate?: string; budgetBand?: MoveBudgetBand; sort: "Newest" | "MoveDate"; page: number; pageSize: number };
export type MarketplaceCard = { id: string; requestType: MoveRequestType; pickupCity: { code: string; name: string } | null; destinationCity: { code: string; name: string } | null; moveDate: string | null; publishedAt: string; budgetBand: MoveBudgetBand | null; numberOfRooms: number | null; boxCount: number; itemCount: number; leadSalesStatus: "Available" | "SoldOut" };
export type MarketplaceAccess = { floor: number | null; hasElevator: boolean | null; elevatorFurnitureSuitability: ElevatorFurnitureSuitability; parkingDistanceMeters: number | null };
export type MarketplaceItem = { kind: MoveItemKind; apartmentInventoryType: ApartmentInventoryItemType | null; specialItemType: SpecialItemType | null; smallMoveCategory: SmallMoveItemCategory | null; quantity: number; lengthCm: number | null; widthCm: number | null; heightCm: number | null; approximateWeightKg: number | null };
export type MarketplaceDetails = MarketplaceCard & { pickupAccess: MarketplaceAccess | null; destinationAccess: MarketplaceAccess | null; preferredTime: PreferredMoveTime | null; dateFlexibility: MoveDateFlexibility | null; items: MarketplaceItem[]; services: { furnitureDisassembly: boolean; furnitureAssembly: boolean; packingAssistance: boolean; packingMaterials: boolean } };
export type MarketplacePage = { items: MarketplaceCard[]; page: number; pageSize: number; totalCount: number };
type SearchValues = Record<string, string | string[] | undefined>;
const codePattern = /^[1-9][0-9]{0,5}$/;
const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function parseMarketplaceFilters(values: SearchValues): MarketplaceFilters {
  const get = (key: string) => typeof values[key] === "string" ? values[key] as string : "";
  const positive = (key: string, fallback: number, max: number) => /^[1-9]\d*$/.test(get(key)) && Number(get(key)) <= max ? Number(get(key)) : fallback;
  return {
    requestType: ["ApartmentMove", "SmallMove"].includes(get("requestType")) ? get("requestType") as MoveRequestType : undefined,
    pickupCityCode: codePattern.test(get("pickupCityCode")) ? get("pickupCityCode") : undefined,
    destinationCityCode: codePattern.test(get("destinationCityCode")) ? get("destinationCityCode") : undefined,
    moveDate: dateOnly(get("moveDate")) ? get("moveDate") : undefined,
    budgetBand: marketplaceBudgets.includes(get("budgetBand") as MoveBudgetBand) ? get("budgetBand") as MoveBudgetBand : undefined,
    sort: get("sort") === "MoveDate" ? "MoveDate" : "Newest", page: positive("page", 1, 1_000_000), pageSize: positive("pageSize", 12, 50),
  };
}
export function marketplaceQuery(filters: MarketplaceFilters) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") query.set(key, String(value));
  return query.toString();
}
function invalid(): never { throw new MovelyApiError("לא הצלחנו לקרוא את פרטי הבקשות. נסו שוב.", { errorCode: "MARKETPLACE_INVALID_RESPONSE", status: 0 }); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) invalid(); return value as Record<string, unknown>; }
function choice<T extends string>(value: unknown, allowed: readonly T[]): T { if (typeof value !== "string" || !allowed.includes(value as T)) invalid(); return value as T; }
function integer(value: unknown, min = 0): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) invalid(); return value; }
function optional<T>(value: unknown, parse: (value: unknown) => T): T | null { return value == null ? null : parse(value); }
function decimal(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value) || value < 0) invalid(); return value; }
function boolean(value: unknown): boolean { if (typeof value !== "boolean") invalid(); return value; }
function city(value: unknown) {
  const row = object(value);
  if (typeof row.code !== "string" || !codePattern.test(row.code) || typeof row.name !== "string" || !row.name.trim() || row.name.length > 120 || /[\p{Cc}\p{Cf}]/u.test(row.name)) invalid();
  return { code: row.code, name: row.name };
}
function rejectProtectedFields(value: unknown) {
  if (!value || typeof value !== "object") return;
  const forbidden = new Set(["customerUserId", "customerName", "firstName", "lastName", "phone", "email", "exactAddress", "customerComment", "objectKey", "originalFileName", "photos", "url", "description", "stairsInfo", "truckAccessInfo"]);
  for (const [key, child] of Object.entries(value)) { if (forbidden.has(key)) invalid(); rejectProtectedFields(child); }
}
function card(value: unknown): MarketplaceCard {
  const row = object(value);
  if (typeof row.id !== "string" || !guidPattern.test(row.id) || typeof row.publishedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(row.publishedAt) || !Number.isFinite(Date.parse(row.publishedAt))) invalid();
  return {
    id: row.id, requestType: choice(row.requestType, ["ApartmentMove", "SmallMove"]),
    pickupCity: optional(row.pickupCity, city), destinationCity: optional(row.destinationCity, city),
    moveDate: optional(row.moveDate, (value) => { if (typeof value !== "string" || !dateOnly(value)) invalid(); return value; }),
    publishedAt: row.publishedAt, budgetBand: optional(row.budgetBand, (value) => choice(value, marketplaceBudgets)),
    numberOfRooms: optional(row.numberOfRooms, (value) => integer(value, 1)), boxCount: integer(row.boxCount), itemCount: integer(row.itemCount),
    leadSalesStatus: choice(row.leadSalesStatus, ["Available", "SoldOut"]),
  };
}
function access(value: unknown): MarketplaceAccess {
  const row = object(value);
  return { floor: optional(row.floor, (number) => integer(number, -5)), hasElevator: optional(row.hasElevator, boolean), elevatorFurnitureSuitability: choice(row.elevatorFurnitureSuitability, ["Unknown", "Yes", "No"]), parkingDistanceMeters: optional(row.parkingDistanceMeters, integer) };
}
function item(value: unknown): MarketplaceItem {
  const row = object(value);
  return {
    kind: choice(row.kind, ["ApartmentInventory", "SmallMoveItem", "SpecialItem"]),
    apartmentInventoryType: optional(row.apartmentInventoryType, (value) => choice(value, ["Sofa", "Bed", "Mattress", "Wardrobe", "Dresser", "Table", "Chair", "Refrigerator", "WashingMachine", "Dryer", "Oven", "Television", "Desk", "Bookshelf", "Custom"])),
    specialItemType: optional(row.specialItemType, (value) => choice(value, ["Piano", "Safe", "OversizedRefrigerator", "Glass", "Artwork", "Antique", "HeavyObject", "FragileEquipment", "Other"])),
    smallMoveCategory: optional(row.smallMoveCategory, (value) => choice(value, ["Furniture", "Electronics", "Appliance", "Boxes", "Equipment", "Other"])),
    quantity: integer(row.quantity, 1), lengthCm: optional(row.lengthCm, decimal), widthCm: optional(row.widthCm, decimal), heightCm: optional(row.heightCm, decimal), approximateWeightKg: optional(row.approximateWeightKg, decimal),
  };
}
async function request(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${MOVELY_API_BASE_URL}${path}`, { method: "GET", credentials: "include", cache: "no-store", signal });
  if (!response.ok) {
    let errorCode = "MARKETPLACE_UNAVAILABLE";
    try { const payload = object(await response.json()); if (typeof payload.errorCode === "string") errorCode = payload.errorCode; } catch { /* Never expose backend text. */ }
    throw new MovelyApiError("לא ניתן לטעון את הבקשות כרגע.", { status: response.status, errorCode });
  }
  let payload: unknown;
  try { payload = await response.json(); } catch { invalid(); }
  rejectProtectedFields(payload);
  return payload;
}
export async function getMarketplaceRequests(filters: MarketplaceFilters, signal?: AbortSignal): Promise<MarketplacePage> {
  const row = object(await request(`/api/v1/marketplace/requests?${marketplaceQuery(filters)}`, signal));
  if (!Array.isArray(row.items) || row.items.length > 50) invalid();
  const result = { items: row.items.map(card), page: integer(row.page, 1), pageSize: integer(row.pageSize, 1), totalCount: integer(row.totalCount) };
  // Count and page rows are separate reads: concurrent publications can make
  // the count smaller than this page without making either response malformed.
  if (result.page !== filters.page || result.pageSize !== filters.pageSize || result.items.length > result.pageSize || new Set(result.items.map((item) => item.id)).size !== result.items.length) invalid();
  return result;
}
export async function getMarketplaceRequest(id: string, signal?: AbortSignal): Promise<MarketplaceDetails> {
  if (!guidPattern.test(id)) throw new MovelyApiError("הבקשה לא נמצאה.", { errorCode: "REQUEST_NOT_FOUND", status: 404 });
  const row = object(await request(`/api/v1/marketplace/requests/${encodeURIComponent(id)}`, signal));
  const summary = card(row);
  if (summary.id.toLowerCase() !== id.toLowerCase() || !Array.isArray(row.items) || row.items.length > 1000) invalid();
  const services = object(row.services);
  return { ...summary, pickupAccess: optional(row.pickupAccess, access), destinationAccess: optional(row.destinationAccess, access), preferredTime: optional(row.preferredTime, (value) => choice(value, ["Morning", "Afternoon", "Evening", "Flexible"])), dateFlexibility: optional(row.dateFlexibility, (value) => choice(value, ["Exact", "PlusMinusOneDay", "PlusMinusThreeDays", "WithinOneWeek"])), items: row.items.map(item), services: { furnitureDisassembly: boolean(services.furnitureDisassembly), furnitureAssembly: boolean(services.furnitureAssembly), packingAssistance: boolean(services.packingAssistance), packingMaterials: boolean(services.packingMaterials) } };
}
