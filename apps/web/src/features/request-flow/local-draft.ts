import type { FormState } from "./request-flow-types";

const KEY = "movely.anonymous-draft.v1";
const TTL = 24 * 60 * 60 * 1000;
const MAX_LENGTH = 250_000;
type Draft = { version: 1; expiresAt: number; step: number; form: FormState };
type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => typeof v === "string" && v.length <= 10_000;
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const nullableText = (v: unknown) => v === null || text(v);
const nullableNumber = (v: unknown) => v === null || number(v);
const bool = (v: unknown) => typeof v === "boolean";
const fields = (v: unknown, rules: Record<string, (value: unknown) => boolean>) =>
  record(v) && Object.entries(rules).every(([key, test]) => test(v[key]));
const items = (v: unknown, rules: Record<string, (value: unknown) => boolean>) =>
  Array.isArray(v) && v.length <= 500 && v.every((item) => fields(item, rules));
const location = (v: unknown) => fields(v, {
  city: nullableText, exactAddress: nullableText, floor: nullableNumber,
  hasElevator: (value) => value === null || bool(value), elevatorFurnitureSuitability: nullableText,
  stairsInfo: nullableText, truckAccessInfo: nullableText, parkingDistanceMeters: nullableNumber,
});
const itemFields = { id: text, name: text, description: text, quantity: number };
const dimensions = { lengthCm: text, widthCm: text, heightCm: text, approximateWeightKg: text };
const rules = {
  requestType: (v: unknown) => v === null || v === "ApartmentMove" || v === "SmallMove",
  pickup: location, destination: location, apartmentRooms: nullableNumber,
  smallBoxes: number, mediumBoxes: number, largeBoxes: number,
  apartmentInventory: (v: unknown) => items(v, { ...itemFields, ...dimensions, apartmentInventoryType: text }),
  smallMoveItems: (v: unknown) => items(v, { ...itemFields, ...dimensions, smallMoveCategory: text }),
  specialItems: (v: unknown) => items(v, { ...itemFields, specialItemType: text }),
  furnitureDisassembly: bool, furnitureAssembly: bool, packingAssistance: bool, packingMaterials: bool,
  moveDate: text, preferredTime: nullableText, dateFlexibility: nullableText, budgetBand: nullableText,
  customerComment: text,
};

// Allow-listed form fields only. Never persist identity, credentials, OTPs,
// authentication state, server request IDs or file metadata in this adapter.
function draftFields(form: RecordValue) {
  const pick = (value: RecordValue, names: string[]) => Object.fromEntries(names.map((key) => [key, value[key]]));
  const picked = pick(form, Object.keys(rules));
  const locationKeys = ["city", "exactAddress", "floor", "hasElevator", "elevatorFurnitureSuitability", "stairsInfo", "truckAccessInfo", "parkingDistanceMeters"];
  picked.pickup = pick(form.pickup as RecordValue, locationKeys);
  picked.destination = pick(form.destination as RecordValue, locationKeys);
  for (const [key, extra] of [["apartmentInventory", "apartmentInventoryType"], ["smallMoveItems", "smallMoveCategory"], ["specialItems", "specialItemType"]]) {
    const names = [...Object.keys(itemFields), ...(key === "specialItems" ? [] : Object.keys(dimensions)), extra];
    picked[key] = (form[key] as RecordValue[]).map((item) => pick(item, names));
  }
  return { ...picked, pendingPhotos: [] };
}

export function clearLocalDraft() {
  try { window.sessionStorage.removeItem(KEY); } catch { /* Storage may be disabled. */ }
}

export function readLocalDraft(now = Date.now()): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    if (raw.length > MAX_LENGTH) { clearLocalDraft(); return null; }
    const data: unknown = JSON.parse(raw);
    if (!record(data) || data.version !== 1 || !number(data.expiresAt) ||
        (data.expiresAt as number) <= now || (data.expiresAt as number) > now + TTL ||
        !Number.isInteger(data.step) || (data.step as number) < 0 || (data.step as number) > 9 ||
        !fields(data.form, rules)) {
      clearLocalDraft(); return null;
    }
    return { version: 1, expiresAt: data.expiresAt as number, step: data.step as number,
      form: draftFields(data.form as RecordValue) as unknown as FormState };
  } catch { clearLocalDraft(); return null; }
}

export function saveLocalDraft(form: FormState, step: number, now = Date.now()): boolean {
  try {
    if (!fields(form, rules) || !Number.isInteger(step) || step < 0 || step > 9) {
      clearLocalDraft(); return false;
    }
    const value = JSON.stringify({ version: 1, expiresAt: now + TTL, step, form: draftFields(form as unknown as RecordValue) });
    if (value.length > MAX_LENGTH) { clearLocalDraft(); return false; }
    window.sessionStorage.setItem(KEY, value);
    return true;
  } catch { clearLocalDraft(); return false; }
}
