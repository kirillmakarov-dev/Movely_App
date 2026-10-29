import { clearLocalDraft, readLocalDraft, saveLocalDraft } from "./local-draft";
import type { FormState } from "./request-flow-types";

const KEY = "movely.anonymous-draft.v1";
const location = { city: "Haifa", exactAddress: "Example 4", floor: 2, hasElevator: true, elevatorFurnitureSuitability: "Yes" as const, stairsInfo: "", truckAccessInfo: "", parkingDistanceMeters: null };
const form: FormState = {
  requestType: "ApartmentMove", pickup: location, destination: location,
  apartmentRooms: 3, smallBoxes: 1, mediumBoxes: 0, largeBoxes: 0,
  apartmentInventory: [], specialItems: [], smallMoveItems: [],
  furnitureDisassembly: false, furnitureAssembly: false, packingAssistance: false, packingMaterials: false,
  moveDate: "", preferredTime: null, dateFlexibility: null, budgetBand: null,
  customerComment: "Handle carefully", pendingPhotos: [{ id: "photo", name: "private-photo.png", sizeLabel: "10 KB" }],
};

beforeEach(() => { window.sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

test("restores allowed form fields and step, without photo metadata or injected credentials", () => {
  const withExtraFields = { ...form, credential: "secret", otpCode: "123456", userId: "user-1", pickup: { ...location, token: "nested-secret" } };
  expect(saveLocalDraft(withExtraFields, 2, 1000)).toBe(true);
  expect(readLocalDraft(1100)).toMatchObject({ step: 2, form: { customerComment: "Handle carefully", pendingPhotos: [] } });
  const stored = window.sessionStorage.getItem(KEY)!;
  for (const secret of ["secret", "123456", "user-1", "private-photo.png", "credential", "otpCode"]) expect(stored).not.toContain(secret);
});

test("expired drafts are removed instead of restored", () => {
  saveLocalDraft(form, 1, 1000);
  expect(readLocalDraft(1000 + 24 * 60 * 60 * 1000)).toBeNull();
  expect(window.sessionStorage.getItem(KEY)).toBeNull();
});

test.each(["{broken", JSON.stringify({ version: 1, expiresAt: 10000, step: 0, form: {} }), JSON.stringify({ version: 2 })])("corrupted or incompatible data is discarded: %s", (value) => {
  window.sessionStorage.setItem(KEY, value);
  expect(readLocalDraft(1000)).toBeNull();
  expect(window.sessionStorage.getItem(KEY)).toBeNull();
});

test("unexpected nested array contents cannot reach the form", () => {
  saveLocalDraft(form, 0, 1000);
  const stored = JSON.parse(window.sessionStorage.getItem(KEY)!);
  stored.form.apartmentInventory = [null];
  window.sessionStorage.setItem(KEY, JSON.stringify(stored));
  expect(readLocalDraft(1100)).toBeNull();
});

test("storage failure is reported and cannot crash the form", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
  expect(saveLocalDraft(form, 0)).toBe(false);
  expect(() => clearLocalDraft()).not.toThrow();
});

test("clearing a draft removes only the application draft", () => {
  window.sessionStorage.setItem("unrelated", "keep");
  saveLocalDraft(form, 0);
  clearLocalDraft();
  expect(readLocalDraft()).toBeNull();
  expect(window.sessionStorage.getItem("unrelated")).toBe("keep");
});
