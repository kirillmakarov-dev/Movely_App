import type { MoveItemDto, MoveRequestResponse, MoveRequestType, UpdateMoveRequestRequest } from "@/lib/movely-api";
import { buildUpdatePayload, hydrateFromRequest, makeFormState, makeLocation } from "./request-form-model";
import { validateRequest } from "./request-validation";

function savedRequest(requestType: MoveRequestType) {
  const measured: MoveItemDto = {
    kind: "ApartmentInventory", apartmentInventoryType: "Sofa", smallMoveCategory: null, specialItemType: null,
    name: null, description: "Original fragile upholstery", quantity: 2,
    lengthCm: 240.5, widthCm: 80, heightCm: 90.25, approximateWeightKg: 73.5,
  };
  const small: MoveItemDto = { ...measured, kind: "SmallMoveItem", apartmentInventoryType: null, smallMoveCategory: "Furniture" };
  const special: MoveItemDto = { ...measured, kind: "SpecialItem", apartmentInventoryType: null, specialItemType: "Piano" };
  const content: UpdateMoveRequestRequest = {
    requestType,
    pickup: { city: "חיפה", exactAddress: "רחוב 1", floor: 0, hasElevator: false, elevatorFurnitureSuitability: "Unknown", stairsInfo: "Side staircase", truckAccessInfo: "Rear entrance", parkingDistanceMeters: 0 },
    destination: { city: "תל אביב - יפו", exactAddress: "רחוב 2", floor: 3, hasElevator: true, elevatorFurnitureSuitability: "Unknown", stairsInfo: null, truckAccessInfo: null, parkingDistanceMeters: 50 },
    apartmentMove: requestType === "ApartmentMove" ? {
      numberOfRooms: 4, boxes: { small: 2, medium: 3, large: 4 }, inventoryItems: [measured],
      additionalServices: { furnitureDisassembly: true, furnitureAssembly: false, packingAssistance: true, packingMaterials: true },
    } : null,
    smallMoveItems: requestType === "SmallMove" ? [small] : null,
    specialItems: [special, { ...special, name: "Other piano", description: null, lengthCm: null, widthCm: null, heightCm: null, approximateWeightKg: null }],
    schedule: { moveDate: "2026-11-12", preferredTime: "Afternoon", dateFlexibility: "PlusMinusOneDay" },
    budgetBand: "From3000To5000", customerComment: "Call before arrival",
    photos: [
      { objectKey: "owner/private/photo-1", originalFileName: "piano.jpg", contentType: "image/jpeg", sizeBytes: 23456, displayOrder: 2 },
      { objectKey: "owner/private/photo-2", originalFileName: null, contentType: "image/png", sizeBytes: 9876, displayOrder: 1 },
    ],
  };
  const request: MoveRequestResponse = {
    id: "request", customerUserId: "owner", requestType, status: "Published", leadSalesStatus: "Available",
    duplicateRisk: false, leadPrice: { currency: "ILS", amountMinor: 5000 }, maxLeadBuyers: 3, activeBuyerCount: 0,
    createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", publishedAt: "2026-10-02T10:00:00Z",
    closedAt: null, cancelledAt: null, expiredAt: null,
    currentVersion: {
      ...content, id: "version", moveRequestId: "request", versionNumber: 2, createdByUserId: "owner", createdAt: "2026-10-02T10:00:00Z",
      smallMoveItems: content.smallMoveItems ?? [], specialItems: content.specialItems!, schedule: content.schedule!, photos: content.photos!,
    },
  };
  return { request, content };
}

describe.each(["ApartmentMove", "SmallMove"] as const)("%s saved content", (type) => {
  test("round trips every content field, including null names, hidden measurements, descriptions and photo metadata", () => {
    const { request, content } = savedRequest(type);
    const form = hydrateFromRequest(request);
    expect(buildUpdatePayload(form, request.currentVersion)).toEqual(content);
    expect(validateRequest(form, true, "2026-10-29")).toEqual([]);
  });

  test("changing only the date and address leaves all other content untouched", () => {
    const { request, content } = savedRequest(type);
    const snapshot = structuredClone(request);
    const form = hydrateFromRequest(request);
    form.moveDate = "2026-11-13";
    form.pickup.exactAddress = "New address 7";
    expect(buildUpdatePayload(form, request.currentVersion)).toEqual({
      ...content, pickup: { ...content.pickup, exactAddress: "New address 7" }, schedule: { ...content.schedule, moveDate: "2026-11-13" },
    });
    expect(request).toEqual(snapshot);
  });

  test("intentional item edits affect only the selected fields and preserve hidden special measurements", () => {
    const { request, content } = savedRequest(type);
    const form = hydrateFromRequest(request);
    const item = type === "ApartmentMove" ? form.apartmentInventory[0] : form.smallMoveItems[0];
    item.name = "New item name";
    item.description = "Updated description";
    item.widthCm = "";
    item.approximateWeightKg = "0";
    form.specialItems[0].quantity = 3;
    const payload = buildUpdatePayload(form, request.currentVersion);
    const expectedItem = (type === "ApartmentMove" ? content.apartmentMove!.inventoryItems! : content.smallMoveItems!)[0];
    const actualItem = (type === "ApartmentMove" ? payload.apartmentMove!.inventoryItems! : payload.smallMoveItems!)[0];
    expect(actualItem).toEqual({ ...expectedItem, name: "New item name", description: "Updated description", widthCm: null, approximateWeightKg: 0 });
    expect(payload.specialItems).toEqual([{ ...content.specialItems![0], quantity: 3 }, content.specialItems![1]]);
    expect(payload.photos).toEqual(content.photos);
  });

  test("payload locations and photos cannot mutate the form or saved snapshot by reference", () => {
    const { request } = savedRequest(type);
    const form = hydrateFromRequest(request);
    const snapshot = structuredClone(request);
    const payload = buildUpdatePayload(form, request.currentVersion);
    payload.destination!.city = "Changed outside the form";
    payload.photos![0].objectKey = "changed";
    payload.photos!.reverse();
    expect(request).toEqual(snapshot);
    expect(form.destination).toEqual(snapshot.currentVersion!.destination);
  });
});

test("new forms and their route fields are independent, and an unversioned request hydrates without invented content", () => {
  const first = makeFormState();
  const second = makeFormState();
  first.pickup.city = "חיפה";
  first.specialItems.push({ id: "new", specialItemType: "Piano", name: "", description: "", quantity: 1 });
  expect(second).toEqual(makeFormState());
  expect(first.destination).toEqual(makeLocation());
  const { request } = savedRequest("SmallMove");
  const form = hydrateFromRequest({ ...request, currentVersion: null });
  expect(form).toEqual({ ...makeFormState(), requestType: "SmallMove" });
  expect(buildUpdatePayload(form)).toMatchObject({ pickup: null, destination: null, schedule: null, photos: [], apartmentMove: null });
});

test.each([
  { floor: 0 }, { hasElevator: false }, { parkingDistanceMeters: 0 }, { stairsInfo: "Narrow staircase" }, { truckAccessInfo: "Rear entrance" },
])("partial drafts preserve supplied access details without an address: %j", (access) => {
  const form = makeFormState();
  form.pickup = { ...makeLocation(), ...access };
  expect(buildUpdatePayload(form).pickup).toEqual(form.pickup);
});

test("the current content version supplies the request type, and incomplete content still fails publication validation", () => {
  const { request } = savedRequest("SmallMove");
  const form = hydrateFromRequest({ ...request, requestType: "ApartmentMove" });
  expect(form.requestType).toBe("SmallMove");
  form.smallMoveItems = [];
  form.moveDate = "";
  expect(validateRequest(form, true, "2026-10-29").map((issue) => issue.field)).toEqual(["smallMoveItems", "moveDate"]);
});
