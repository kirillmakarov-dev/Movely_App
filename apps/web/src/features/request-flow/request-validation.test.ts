import { validateRequest } from "./request-validation";
import type { FormState } from "./request-flow-types";

const location = { city: "חיפה", exactAddress: "רחוב לדוגמה 1", floor: null, hasElevator: null, elevatorFurnitureSuitability: "Unknown" as const, stairsInfo: "", truckAccessInfo: "", parkingDistanceMeters: null };
const complete: FormState = {
  requestType: "ApartmentMove", pickup: location, destination: location, apartmentRooms: 3,
  smallBoxes: 0, mediumBoxes: 0, largeBoxes: 0, apartmentInventory: [], specialItems: [], smallMoveItems: [],
  furnitureDisassembly: false, furnitureAssembly: false, packingAssistance: false, packingMaterials: false,
  moveDate: "2026-11-01", preferredTime: "Morning", dateFlexibility: "Exact", budgetBand: null, customerComment: "", pendingPhotos: [],
};
const validate = (form: FormState, publish = true) => validateRequest(form, publish, "2026-10-29");

test("a publishable apartment needs no optional budget, inventory, accessibility detail or notes", () => {
  expect(validate(complete)).toEqual([]);
});

test("partial drafts remain savable while publication identifies each missing requirement", () => {
  const partial = { ...complete, pickup: { ...location, city: "  ", exactAddress: "" }, apartmentRooms: null, moveDate: "", preferredTime: null, dateFlexibility: null };
  expect(validate(partial, false)).toEqual([]);
  expect(validate(partial).map((issue) => issue.field)).toEqual(["pickup.city", "pickup.exactAddress", "apartmentRooms", "moveDate", "preferredTime", "dateFlexibility"]);
});

test("small moves require a transported item but never apartment-only fields", () => {
  const form: FormState = { ...complete, requestType: "SmallMove", apartmentRooms: null, smallBoxes: -1 };
  expect(validate(form).map((issue) => issue.field)).toEqual(["smallMoveItems"]);
  form.smallMoveItems = [{ id: "one", smallMoveCategory: "Furniture", name: "ספה", description: "", quantity: 1, lengthCm: "", widthCm: "", heightCm: "", approximateWeightKg: "" }];
  expect(validate(form)).toEqual([]);
});

test.each(["2026-10-28", "2028-02-30", "2026-99-01", "not-a-date"])("invalid or past date %s is rejected even in drafts", (moveDate) => {
  expect(validate({ ...complete, moveDate }, false)).toContainEqual(expect.objectContaining({ field: "moveDate" }));
});

test("same-day moves and real leap dates are accepted", () => {
  expect(validate({ ...complete, moveDate: "2026-10-29" })).toEqual([]);
  expect(validate({ ...complete, moveDate: "2028-02-29" })).toEqual([]);
});

test("fractional integer fields, negative measurements and excessive notes cannot be sent as a draft", () => {
  const form: FormState = { ...complete, pickup: { ...location, floor: 2.5, parkingDistanceMeters: -1 }, customerComment: "א".repeat(2001),
    apartmentInventory: [{ id: "sofa", apartmentInventoryType: "Sofa", name: "ספה", description: "", quantity: 0, lengthCm: "-2", widthCm: "", heightCm: "", approximateWeightKg: "Infinity" }] };
  expect(validate(form, false).map((issue) => issue.field)).toEqual(["pickup.floor", "pickup.parkingDistanceMeters", "apartmentInventory.sofa.quantity", "apartmentInventory.sofa.lengthCm", "apartmentInventory.sofa.approximateWeightKg", "customerComment"]);
});

test("quantity paths use row identity so removing a different item cannot redirect an error", () => {
  const item = { id: "piano", specialItemType: "Piano" as const, name: "פסנתר", description: "", quantity: 1.5 };
  expect(validate({ ...complete, specialItems: [item] }, false)[0].field).toBe("specialItems.piano.quantity");
  expect(validate({ ...complete, customerComment: "א".repeat(2000) }, false)).toEqual([]);
});
