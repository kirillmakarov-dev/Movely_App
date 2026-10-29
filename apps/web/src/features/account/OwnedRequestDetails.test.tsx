import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import OwnedRequestDetails from "./OwnedRequestDetails";
import { MovelyApiError, type MoveRequestResponse } from "@/lib/movely-api";

const api = vi.hoisted(() => ({ get: vi.fn(), close: vi.fn(), cancel: vi.fn() }));
vi.mock("@/lib/movely-api", async () => ({
  ...await vi.importActual("@/lib/movely-api"),
  getMoveRequest: api.get, closeMoveRequest: api.close, cancelMoveRequest: api.cancel,
}));

const request: MoveRequestResponse = {
  id: "aaaaaaaa-1111-4111-8111-111111111111", customerUserId: "owner-private-id", requestType: "ApartmentMove",
  status: "Draft", leadSalesStatus: "Closed", duplicateRisk: false, leadPrice: { currency: "ILS", amountMinor: 1000 },
  maxLeadBuyers: 3, activeBuyerCount: 0, createdAt: "2026-10-29T10:00:00Z", updatedAt: "2026-10-29T11:00:00Z",
  publishedAt: null, closedAt: null, cancelledAt: null, expiredAt: null,
  currentVersion: {
    id: "version-private-id", moveRequestId: "aaaaaaaa-1111-4111-8111-111111111111", versionNumber: 1,
    createdByUserId: "owner-private-id", createdAt: "2026-10-29T10:00:00Z", requestType: "ApartmentMove",
    pickup: { city: "חיפה", exactAddress: "רחוב הגפן 17", floor: 0, hasElevator: false, elevatorFurnitureSuitability: "Unknown", stairsInfo: null, truckAccessInfo: "כניסה מהרחוב", parkingDistanceMeters: 0 },
    destination: { city: "תל אביב", exactAddress: "רחוב הדקל 22", floor: 3, hasElevator: true, elevatorFurnitureSuitability: "Yes", stairsInfo: "שלוש מדרגות בכניסה", truckAccessInfo: null, parkingDistanceMeters: 20 },
    apartmentMove: { numberOfRooms: 3, boxes: { small: 0, medium: 5, large: 2 }, inventoryItems: [{
      kind: "ApartmentInventory", apartmentInventoryType: "Sofa", specialItemType: null, smallMoveCategory: null,
      name: null, description: "בד כחול", quantity: 1, lengthCm: 200, widthCm: 80, heightCm: null, approximateWeightKg: 40,
    }], additionalServices: { furnitureDisassembly: true, furnitureAssembly: false, packingAssistance: true, packingMaterials: false } },
    smallMoveItems: [], specialItems: [{
      kind: "SpecialItem", apartmentInventoryType: null, specialItemType: "Piano", smallMoveCategory: null,
      name: null, description: null, quantity: 1, lengthCm: null, widthCm: null, heightCm: null, approximateWeightKg: null,
    }], schedule: { moveDate: "2026-11-03", preferredTime: "Morning", dateFlexibility: "PlusMinusOneDay" },
    budgetBand: "From2000To3000", customerComment: "נא להתקשר לפני ההגעה",
    photos: [{ objectKey: "private/storage/secret.jpg", originalFileName: "private-name.jpg", contentType: "image/jpeg", sizeBytes: 123, displayOrder: 0 }],
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockResolvedValue(request);
  api.close.mockResolvedValue({ ...request, status: "Closed", closedAt: "2026-10-29T12:00:00Z" });
  api.cancel.mockResolvedValue({ ...request, status: "Cancelled", cancelledAt: "2026-10-29T12:00:00Z" });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

test("loads only the owner API and displays complete owner details without exposing storage metadata", async () => {
  const { container } = render(<OwnedRequestDetails requestId={request.id} />);
  expect(screen.getByRole("status")).toHaveTextContent("טוענים את פרטי הבקשה");
  expect(await screen.findByText("רחוב הגפן 17")).toBeVisible();
  expect(screen.getByText("רחוב הדקל 22")).toBeVisible();
  expect(screen.getByText("קומת קרקע")).toBeVisible();
  expect(screen.getByText("0 מטרים")).toBeVisible();
  expect(screen.getByText("ארגזים קטנים").nextElementSibling).toHaveTextContent("0");
  expect(screen.getByText("3 בנובמבר 2026")).toBeVisible();
  expect(screen.getByText("בוקר")).toBeVisible();
  expect(screen.getByText("± יום אחד")).toBeVisible();
  expect(screen.getByText("2,000-3,000 ₪")).toBeVisible();
  expect(screen.getByRole("heading", { name: "ספה" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "פסנתר" })).toBeVisible();
  expect(screen.getByText("בד כחול")).toBeVisible();
  expect(screen.getByText("אורך (ס״מ)").nextElementSibling).toHaveTextContent("200");
  expect(screen.getByText("פירוק רהיטים")).toBeVisible();
  expect(screen.getByText("סיוע באריזה")).toBeVisible();
  expect(screen.getByText("נא להתקשר לפני ההגעה")).toBeVisible();
  expect(screen.getByRole("link", { name: "המשך עריכת הטיוטה" })).toHaveAttribute("href", `/request/new?requestId=${request.id}`);
  expect(screen.getByRole("link", { name: "חזרה לבקשות שלי" })).toHaveAttribute("href", "/account/requests");
  expect(api.get).toHaveBeenCalledWith(request.id, expect.any(AbortSignal));
  expect(container.innerHTML).not.toMatch(/private\/storage|private-name|owner-private-id|version-private-id/);
  expect(container.querySelector("img")).toBeNull();
});

test("an empty server draft has a truthful explanation and a direct edit link", async () => {
  api.get.mockResolvedValue({ ...request, currentVersion: null });
  render(<OwnedRequestDetails requestId={request.id} />);
  expect(await screen.findByText("עדיין לא נשמרו פרטי הובלה בבקשה הזאת.")).toBeVisible();
  expect(screen.getByRole("link", { name: "המשך עריכת הטיוטה" })).toBeVisible();
  expect(screen.queryByText("רחוב הגפן 17")).not.toBeInTheDocument();
});

test("small moves display their own items without apartment-only sections or invented services", async () => {
  api.get.mockResolvedValue({ ...request, requestType: "SmallMove", currentVersion: {
    ...request.currentVersion, requestType: "SmallMove", apartmentMove: null, specialItems: [],
    smallMoveItems: [{ ...request.currentVersion!.apartmentMove!.inventoryItems![0], kind: "SmallMoveItem", apartmentInventoryType: null, smallMoveCategory: "Appliance", name: "מקרר קטן", quantity: 2 }],
  } });
  render(<OwnedRequestDetails requestId={request.id} />);
  expect(await screen.findByRole("heading", { name: "מקרר קטן" })).toBeVisible();
  expect(screen.getByText("כמות").nextElementSibling).toHaveTextContent("2");
  expect(screen.queryByRole("heading", { name: "הדירה והארגזים" })).not.toBeInTheDocument();
  expect(screen.getByText("לא נבחרו שירותים נוספים.")).toBeVisible();
});

test.each([
  [401, "התחברו כדי לצפות בבקשה"], [403, "אין גישה לבקשה בחשבון הזה"], [404, "הבקשה לא נמצאה"],
])("HTTP %s is a distinct safe error with no owner content", async (status, title) => {
  api.get.mockRejectedValue(new MovelyApiError("private server details", { errorCode: "TEST", status }));
  render(<OwnedRequestDetails requestId={request.id} />);
  expect(await screen.findByRole("heading", { name: title })).toBeVisible();
  expect(screen.getByRole("alert")).not.toHaveTextContent("private server details");
  expect(screen.queryByText("רחוב הגפן 17")).not.toBeInTheDocument();
  if (status !== 404) expect(screen.getByRole("link", { name: "כניסה לחשבון" })).toHaveAttribute("href", "/auth");
  expect(api.close).not.toHaveBeenCalled();
  expect(api.cancel).not.toHaveBeenCalled();
});

test("a failed GET can be retried without replacing it with mock content", async () => {
  api.get.mockRejectedValueOnce(new TypeError("offline"));
  render(<OwnedRequestDetails requestId={request.id} />);
  expect(await screen.findByRole("heading", { name: "לא הצלחנו לטעון את הבקשה" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "ניסיון נוסף" }));
  expect(await screen.findByText("רחוב הגפן 17")).toBeVisible();
  expect(api.get).toHaveBeenCalledTimes(2);
});

test.each([
  null, { ...request, id: "foreign-request" }, { ...request, status: "Unexpected" }, { ...request, status: 0 },
])("rejects a malformed or mismatched GET response without rendering private content: %s", async (response) => {
  api.get.mockResolvedValue(response);
  render(<OwnedRequestDetails requestId={request.id} />);
  expect(await screen.findByRole("heading", { name: "לא הצלחנו לטעון את הבקשה" })).toBeVisible();
  expect(screen.queryByText("רחוב הגפן 17")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "ביטול הבקשה" })).not.toBeInTheDocument();
});

test("accepts the same request ID with different GUID casing", async () => {
  render(<OwnedRequestDetails requestId={request.id.toUpperCase()} />);
  expect(await screen.findByText("רחוב הגפן 17")).toBeVisible();
});

test("a stalled GET aborts at ten seconds and a late response cannot overwrite a successful retry", async () => {
  vi.useFakeTimers();
  const stalled = deferred<MoveRequestResponse>();
  api.get.mockReturnValueOnce(stalled.promise).mockResolvedValueOnce({ ...request, status: "Closed" });
  render(<OwnedRequestDetails requestId={request.id} />);
  const signal = api.get.mock.calls[0][1] as AbortSignal;
  await act(async () => vi.advanceTimersByTime(10_000));
  expect(signal.aborted).toBe(true);
  expect(screen.getByRole("heading", { name: "טעינת הבקשה נמשכת זמן רב מדי" })).toBeVisible();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "ניסיון נוסף" })));
  expect(screen.getByText("סגורה")).toBeVisible();
  await act(async () => stalled.resolve(request));
  expect(screen.getByText("סגורה")).toBeVisible();
  expect(screen.queryByRole("link", { name: "המשך עריכת הטיוטה" })).not.toBeInTheDocument();
  expect(vi.getTimerCount()).toBe(0);
});

test("changing the route and unmounting cancel GETs and hide the previous request", async () => {
  const first = deferred<MoveRequestResponse>();
  const second = deferred<MoveRequestResponse>();
  api.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const { rerender, unmount } = render(<OwnedRequestDetails requestId={request.id} />);
  const oldSignal = api.get.mock.calls[0][1] as AbortSignal;
  rerender(<OwnedRequestDetails requestId="another-request" />);
  expect(oldSignal.aborted).toBe(true);
  await act(async () => first.resolve(request));
  expect(screen.getByRole("status")).toHaveTextContent("טוענים");
  expect(screen.queryByText("רחוב הגפן 17")).not.toBeInTheDocument();
  const currentSignal = api.get.mock.calls[1][1] as AbortSignal;
  unmount();
  expect(currentSignal.aborted).toBe(true);
  await act(async () => second.resolve({ ...request, id: "another-request" }));
});

test.each([
  ["Draft", true, false, true], ["Active", false, true, true], ["Published", false, false, true],
  ["Closed", false, false, false], ["Cancelled", false, false, false], ["Expired", false, false, false],
] as const)("%s shows only server-supported actions", async (status, edit, close, cancel) => {
  api.get.mockResolvedValue({ ...request, status });
  render(<OwnedRequestDetails requestId={request.id} />);
  await screen.findByText("רחוב הגפן 17");
  expect(!!screen.queryByRole("link", { name: "המשך עריכת הטיוטה" })).toBe(edit);
  expect(!!screen.queryByRole("button", { name: "סיום חיפוש מוביל" })).toBe(close);
  expect(!!screen.queryByRole("button", { name: "ביטול הבקשה" })).toBe(cancel);
});

test("cancelling the inline confirmation preserves the request and returns focus", async () => {
  render(<OwnedRequestDetails requestId={request.id} />);
  const trigger = await screen.findByRole("button", { name: "ביטול הבקשה" });
  fireEvent.click(trigger);
  expect(screen.getByRole("heading", { name: "לבטל את הבקשה?" })).toHaveFocus();
  expect(screen.getByText(/לא ניתן להחזיר אותה למצב פעיל/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "חזרה ללא שינוי" }));
  expect(screen.getByRole("button", { name: "ביטול הבקשה" })).toHaveFocus();
  expect(api.cancel).not.toHaveBeenCalled();
});

test("closing requires confirmation, prevents duplicate submissions and renders the server result", async () => {
  api.get.mockResolvedValue({ ...request, status: "Active" });
  const closing = deferred<MoveRequestResponse>();
  api.close.mockReturnValue(closing.promise);
  render(<OwnedRequestDetails requestId={request.id} />);
  fireEvent.click(await screen.findByRole("button", { name: "סיום חיפוש מוביל" }));
  expect(api.close).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "לסיים את חיפוש המוביל?" })).toHaveFocus();
  const confirm = screen.getByRole("button", { name: "אישור סיום החיפוש" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(api.close).toHaveBeenCalledTimes(1);
  expect(api.close).toHaveBeenCalledWith(request.id);
  expect(screen.getByRole("button", { name: "מעדכנים את הבקשה…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "חזרה ללא שינוי" })).toBeDisabled();
  await act(async () => closing.resolve({ ...request, status: "Closed", closedAt: "2026-10-29T12:00:00Z" }));
  expect(screen.getByText("סגורה")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("חיפוש המוביל נסגר");
  expect(screen.queryByRole("button", { name: "סיום חיפוש מוביל" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "ביטול הבקשה" })).not.toBeInTheDocument();
});

test("confirmed cancellation renders the server's terminal state", async () => {
  render(<OwnedRequestDetails requestId={request.id} />);
  fireEvent.click(await screen.findByRole("button", { name: "ביטול הבקשה" }));
  fireEvent.click(screen.getByRole("button", { name: "אישור ביטול הבקשה" }));
  expect(await screen.findByText("בוטלה")).toBeVisible();
  expect(api.cancel).toHaveBeenCalledWith(request.id);
  expect(screen.getByRole("status")).toHaveTextContent("הבקשה בוטלה");
  expect(screen.queryByRole("link", { name: "המשך עריכת הטיוטה" })).not.toBeInTheDocument();
});

test.each([
  null, { ...request, id: "foreign-request", status: "Cancelled" }, { ...request, status: "Draft" },
])("does not claim cancellation succeeded when its response is invalid: %s", async (response) => {
  api.cancel.mockResolvedValue(response);
  render(<OwnedRequestDetails requestId={request.id} />);
  fireEvent.click(await screen.findByRole("button", { name: "ביטול הבקשה" }));
  fireEvent.click(screen.getByRole("button", { name: "אישור ביטול הבקשה" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("ייתכן שהפעולה בוצעה");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "בדיקת מצב הבקשה" })).toBeVisible();
  expect(api.cancel).toHaveBeenCalledTimes(1);
});

test("a close response with the wrong terminal state requires reconciliation", async () => {
  api.get.mockResolvedValue({ ...request, status: "Active" });
  api.close.mockResolvedValue({ ...request, status: "Cancelled" });
  render(<OwnedRequestDetails requestId={request.id} />);
  fireEvent.click(await screen.findByRole("button", { name: "סיום חיפוש מוביל" }));
  expect(screen.getByText(/אינה מוחקת פרטי קשר שכבר שותפו/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "אישור סיום החיפוש" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("ייתכן שהפעולה בוצעה");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test.each([401, 403, 404])("a mutation HTTP %s removes the previously loaded owner content", async (status) => {
  api.cancel.mockRejectedValue(new MovelyApiError("private server details", { errorCode: "TEST", status }));
  render(<OwnedRequestDetails requestId={request.id} />);
  fireEvent.click(await screen.findByRole("button", { name: "ביטול הבקשה" }));
  fireEvent.click(screen.getByRole("button", { name: "אישור ביטול הבקשה" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("רחוב הגפן 17")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).not.toHaveTextContent("private server details");
});

test("a late mutation response cannot replace the next route's owner details", async () => {
  const cancelling = deferred<MoveRequestResponse>();
  api.cancel.mockReturnValue(cancelling.promise);
  const { rerender } = render(<OwnedRequestDetails requestId={request.id} />);
  fireEvent.click(await screen.findByRole("button", { name: "ביטול הבקשה" }));
  fireEvent.click(screen.getByRole("button", { name: "אישור ביטול הבקשה" }));
  api.get.mockResolvedValue({ ...request, id: "next-request", status: "Active" });
  rerender(<OwnedRequestDetails requestId="next-request" />);
  await screen.findByText("פעילה");
  await act(async () => cancelling.resolve({ ...request, status: "Cancelled" }));
  expect(screen.getByText("פעילה")).toBeVisible();
  expect(screen.queryByText("בוטלה")).not.toBeInTheDocument();
});

test.each([
  new TypeError("response lost"),
  new MovelyApiError("timeout", { errorCode: "REQUEST_ACTION_TIMEOUT", status: 0 }),
])("uncertain action outcome requires a GET refresh before further action: %s", async (error) => {
  api.cancel.mockRejectedValue(error);
  api.get.mockResolvedValueOnce(request).mockResolvedValueOnce({ ...request, status: "Cancelled" });
  render(<OwnedRequestDetails requestId={request.id} />);
  fireEvent.click(await screen.findByRole("button", { name: "ביטול הבקשה" }));
  fireEvent.click(screen.getByRole("button", { name: "אישור ביטול הבקשה" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("ייתכן שהפעולה בוצעה");
  expect(screen.queryByRole("button", { name: "אישור ביטול הבקשה" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "ביטול הבקשה" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "בדיקת מצב הבקשה" }));
  expect(await screen.findByText("בוטלה")).toBeVisible();
  expect(api.cancel).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledTimes(2);
});

test("a stale server state is explained safely and can be refreshed", async () => {
  api.cancel.mockRejectedValue(new MovelyApiError("private server details", { errorCode: "INVALID_REQUEST_STATE", status: 409 }));
  render(<OwnedRequestDetails requestId={request.id} />);
  fireEvent.click(await screen.findByRole("button", { name: "ביטול הבקשה" }));
  fireEvent.click(screen.getByRole("button", { name: "אישור ביטול הבקשה" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("ייתכן שמצב הבקשה השתנה");
  expect(screen.getByRole("alert")).not.toHaveTextContent("private server details");
  api.get.mockResolvedValue({ ...request, status: "Closed" });
  fireEvent.click(screen.getByRole("button", { name: "בדיקת מצב הבקשה" }));
  await waitFor(() => expect(screen.getByText("סגורה")).toBeVisible());
});
