import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import RequestChangeSummary, { getRequestChanges } from "./RequestChangeSummary";
import { publicationOwnerRequest } from "@/features/account/publication.test-fixtures";
import { buildUpdatePayload, hydrateFromRequest } from "./request-form-model";
import type { MoveRequestVersionResponse } from "@/lib/movely-api";

afterEach(cleanup);
function fixture() {
  const request = structuredClone(publicationOwnerRequest);
  const before = request.currentVersion!;
  const after = buildUpdatePayload(hydrateFromRequest(request), before);
  return { before, after };
}

test("unchanged content shows no invented changes or version metadata", () => {
  const { before, after } = fixture();
  expect(getRequestChanges(before, after)).toEqual([]);
  render(<RequestChangeSummary before={before} after={after} />);
  expect(screen.getByText(/לא נמצאו שינויים/)).toBeVisible();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
  expect(screen.queryByText(before.id)).not.toBeInTheDocument();
});

test("the comparison shows actual submitted address/access/date values without changing the snapshot", () => {
  const { before, after } = fixture();
  const original = JSON.stringify(before);
  after.pickup!.exactAddress = "כתובת חדשה 25";
  after.pickup!.floor = 4;
  after.pickup!.hasElevator = true;
  after.pickup!.stairsInfo = "שלוש מדרגות";
  after.pickup!.parkingDistanceMeters = 20;
  after.destination!.truckAccessInfo = "כניסה אחורית";
  after.schedule!.moveDate = "2026-12-16";
  after.customerComment = "נא להתקשר לפני ההגעה";
  const changes = getRequestChanges(before, after);
  expect(changes.map((change) => change.key)).toEqual(["pickup.exactAddress", "pickup.floor", "pickup.hasElevator", "pickup.stairsInfo", "pickup.parkingDistanceMeters", "destination.truckAccessInfo", "moveDate", "customerComment"]);
  expect(JSON.stringify(before)).toBe(original);
  render(<RequestChangeSummary before={before} after={after} />);
  const address = screen.getByRole("heading", { name: "איסוף - כתובת" }).closest("li")!;
  expect(within(address).getByText("כתובת פרטית 17")).toBeVisible();
  expect(within(address).getByText("כתובת חדשה 25")).toBeVisible();
  expect(within(address).getByText("לפני השינוי")).toBeVisible();
  expect(within(address).getByText("לאחר השמירה")).toBeVisible();
});

test("item descriptions and measurements are reviewed; item order alone is not a change", () => {
  const { before, after } = fixture();
  before.smallMoveItems.push({ ...before.smallMoveItems[0], name: "כיסא", quantity: 2 });
  after.smallMoveItems = structuredClone(before.smallMoveItems).reverse();
  expect(getRequestChanges(before, after)).toEqual([]);
  after.smallMoveItems[0].lengthCm = 80;
  after.smallMoveItems[0].description = "לטפל בזהירות";
  const change = getRequestChanges(before, after);
  expect(change).toHaveLength(1);
  expect(change[0].key).toBe("smallMoveItems");
  expect(change[0].after).toContain("אורך: 80");
  expect(change[0].after).toContain("לטפל בזהירות");
});

test("category replacement explicitly shows removed contents and new apartment services", () => {
  const { before, after } = fixture();
  after.requestType = "ApartmentMove";
  after.smallMoveItems = null;
  after.apartmentMove = { numberOfRooms: 3, boxes: { small: 2, medium: 1, large: 0 }, inventoryItems: [], additionalServices: { furnitureDisassembly: true, furnitureAssembly: false, packingAssistance: true, packingMaterials: false } };
  const changes = getRequestChanges(before, after);
  expect(changes.find((change) => change.key === "requestType")).toMatchObject({ before: "הובלה קטנה", after: "הובלת דירה" });
  expect(changes.find((change) => change.key === "smallMoveItems")?.before).toContain("שולחן");
  expect(changes.find((change) => change.key === "smallMoveItems")?.after).toBe("לא נכלל בסוג ההובלה הזה");
  expect(changes.find((change) => change.key === "services.furnitureDisassembly")?.after).toBe("כן");
  expect(changes.find((change) => change.key === "boxes.small")?.after).toBe("2");
});

test("preserved special measurements and photos do not create differences, private object keys never render", () => {
  const request = structuredClone(publicationOwnerRequest);
  const before: MoveRequestVersionResponse = request.currentVersion!;
  before.specialItems = [{ kind: "SpecialItem", specialItemType: "Piano", apartmentInventoryType: null, smallMoveCategory: null, name: "פסנתר", description: "קיים", quantity: 1, lengthCm: 120, widthCm: 60, heightCm: 110, approximateWeightKg: 200 }];
  before.photos = [{ objectKey: "private/signed-storage-key", originalFileName: "תמונה.jpg", contentType: "image/jpeg", sizeBytes: 4000, displayOrder: 0 }];
  const after = buildUpdatePayload(hydrateFromRequest(request), before);
  after.customerComment = "הערה מעודכנת";
  expect(getRequestChanges(before, after).map((change) => change.key)).toEqual(["customerComment"]);
  after.specialItems![0].quantity = 2;
  render(<RequestChangeSummary before={before} after={after} />);
  expect(screen.getByRole("heading", { name: "פריטים מיוחדים" })).toBeVisible();
  expect(screen.queryByText(/private\/signed-storage-key/)).not.toBeInTheDocument();
});
