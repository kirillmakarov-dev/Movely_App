import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CustomerRequestFlow from "./CustomerRequestFlow";
import { editContext, editId, nextVersionId } from "./published-edit.test-fixtures";
import { MovelyApiError, type UpdateMoveRequestRequest } from "@/lib/movely-api";
import type { PublishedEditContext } from "@/lib/published-request-api";
const api = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getAuthCapabilities: vi.fn(), getMoveRequest: vi.fn(), getLocalities: vi.fn(), requestWithCsrf: vi.fn(), createMoveRequest: vi.fn(), updateMoveRequest: vi.fn(), publishMoveRequest: vi.fn() }));
const publication = vi.hoisted(() => vi.fn());
vi.mock("@/lib/movely-api", async () => ({ ...await vi.importActual("@/lib/movely-api"), ...api }));
vi.mock("@/lib/request-publication-api", async () => ({ ...await vi.importActual("@/lib/request-publication-api"), getRequestPublicationStatus: publication }));
let context: PublishedEditContext;
beforeEach(() => {
  vi.resetAllMocks(); context = editContext();
  api.getCurrentUser.mockImplementation(async () => structuredClone(context.user));
  api.getAuthCapabilities.mockImplementation(async () => structuredClone(context.capabilities));
  api.getMoveRequest.mockImplementation(async () => structuredClone(context.request));
  publication.mockImplementation(async () => structuredClone(context.publication));
  api.getLocalities.mockResolvedValue([{ code: "4000", name: "חיפה" }]);
  api.requestWithCsrf.mockImplementation(async (_path: string, payload: UpdateMoveRequestRequest) => ({ ...context.request, requestType: payload.requestType, currentVersion: { ...context.request.currentVersion, ...payload, id: nextVersionId, versionNumber: 4, smallMoveItems: payload.smallMoveItems ?? [] } }));
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
async function open() { render(<CustomerRequestFlow mode="published-edit" initialRequestId={editId} />); await screen.findByRole("button", { name: "המשך", exact: true }); }
function step(name: string) { fireEvent.click(screen.getByText("מעבר לשלב אחר")); fireEvent.click(within(screen.getByRole("navigation", { name: "שלבי הבקשה" })).getByRole("button", { name, exact: true })); }
function changeNote(value = "עריכה מקומית") { step("תאריך ותקציב"); fireEvent.change(screen.getByRole("textbox", { name: "הערות (רשות)" }), { target: { value } }); }
function review() { step("בדיקה ושמירת שינויים"); }
function accept() { fireEvent.click(screen.getByRole("checkbox", { name: /אני מאשר.*הגרסה החדשה/ })); }
function save() { return screen.getByRole("button", { name: "שמירת גרסה חדשה" }); }
function foreground() { fireEvent.blur(window); fireEvent.focus(window); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test("normal Continue, Back and step navigation never save or touch browser draft storage", async () => {
  const storage = vi.spyOn(Storage.prototype, "setItem"); await open();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "שלב 1 מתוך 5");
  fireEvent.click(screen.getByRole("button", { name: "המשך", exact: true })); expect(screen.getByRole("textbox", { name: "איסוף כתובת מדויקת" })).toHaveValue("כתובת פרטית 1");
  fireEvent.change(screen.getByRole("textbox", { name: "איסוף כתובת מדויקת" }), { target: { value: "כתובת חדשה 3" } });
  fireEvent.click(screen.getByRole("button", { name: "חזרה", exact: true })); review();
  expect(screen.getAllByText(/כתובת חדשה 3/).length).toBeGreaterThan(0);
  expect(api.requestWithCsrf).not.toHaveBeenCalled(); expect(api.updateMoveRequest).not.toHaveBeenCalled(); expect(api.createMoveRequest).not.toHaveBeenCalled(); expect(api.publishMoveRequest).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
  expect(document.body).not.toHaveTextContent("private/secret-object"); expect(document.body).not.toHaveTextContent("private-name.jpg");
});

test("only final explicit consent saves complete edited content, real recipient limit and preserved private metadata", async () => {
  await open(); changeNote(); review(); expect(save()).toBeDisabled(); accept(); expect(save()).toBeEnabled(); fireEvent.click(save());
  await screen.findByRole("heading", { name: "השינויים נשמרו" });
  expect(api.requestWithCsrf).toHaveBeenCalledTimes(1);
  const payload = api.requestWithCsrf.mock.calls[0][1];
  expect(payload).toMatchObject({ expectedCurrentVersionId: context.request.currentVersion.id, customerComment: "עריכה מקומית", contactSharing: { shareContacts: true, disclosureVersion: context.publication.disclosureVersion, maxRecipients: 7 }, photos: context.request.currentVersion.photos, specialItems: context.request.currentVersion.specialItems, apartmentMove: context.request.currentVersion.apartmentMove });
  expect(api.requestWithCsrf.mock.calls[0][2]).toBe("PUT"); expect(payload).not.toHaveProperty("leadPrice"); expect(payload).not.toHaveProperty("activeBuyerCount");
  expect(api.getCurrentUser).toHaveBeenCalledTimes(2); expect(api.publishMoveRequest).not.toHaveBeenCalled();
});

test("unchanged content cannot create another version, and any edit including change-back clears prior consent", async () => {
  await open(); review(); accept(); expect(save()).toBeDisabled(); changeNote("A"); review(); expect(screen.getByRole("checkbox", { name: /אני מאשר/ })).not.toBeChecked(); accept();
  changeNote("B"); changeNote("A"); review(); expect(screen.getByRole("checkbox", { name: /אני מאשר/ })).not.toBeChecked(); expect(save()).toBeDisabled();
});

test("same-account foreground recheck hides private DOM, preserves local fields and invalidates consent", async () => {
  await open(); changeNote(); review(); accept(); const pending = deferred<PublishedEditContext["user"]>(); api.getCurrentUser.mockReturnValueOnce(pending.promise);
  foreground(); expect(document.body).not.toHaveTextContent("כתובת פרטית 1"); expect(document.body).not.toHaveTextContent("עריכה מקומית");
  fireEvent.focus(window); expect(api.getCurrentUser).toHaveBeenCalledTimes(2);
  await act(async () => pending.resolve(context.user)); await screen.findByRole("button", { name: "שמירת גרסה חדשה" });
  expect(document.body).toHaveTextContent("עריכה מקומית"); expect(screen.getByRole("checkbox", { name: /אני מאשר/ })).not.toBeChecked();
});

test.each(["logout", "switch"])("foreground %s clears private fields and never revives the old local draft", async (kind) => {
  await open(); changeNote(); review(); api.getCurrentUser.mockResolvedValueOnce(kind === "logout" ? null : { ...context.user, id: "different-owner" });
  foreground(); await screen.findByRole("button", { name: "בדיקה מחדש", exact: true });
  expect(document.body).not.toHaveTextContent("עריכה מקומית"); expect(document.body).not.toHaveTextContent("כתובת פרטית 1");
  fireEvent.click(screen.getByRole("button", { name: "בדיקה מחדש", exact: true })); await screen.findByRole("button", { name: "המשך", exact: true });
  changeNote("fresh"); review(); expect(document.body).not.toHaveTextContent("עריכה מקומית");
});

test("version conflict requires explicit choice and fresh consent while preserving local input", async () => {
  await open(); changeNote(); review(); accept();
  context.request.currentVersion.id = nextVersionId; context.request.currentVersion.versionNumber = 4; context.request.currentVersion.customerComment = "עריכה ממכשיר אחר"; context.publication.currentVersionId = nextVersionId;
  fireEvent.click(save()); await screen.findByRole("button", { name: "להמשיך עם הפרטים שלי לבדיקה מחדש" });
  expect(api.requestWithCsrf).not.toHaveBeenCalled(); expect(document.body).toHaveTextContent("עריכה מקומית"); expect(document.body).toHaveTextContent("עריכה ממכשיר אחר");
  fireEvent.click(screen.getByRole("button", { name: "להמשיך עם הפרטים שלי לבדיקה מחדש" })); expect(save()).toBeDisabled(); expect(screen.getByRole("checkbox", { name: /אני מאשר/ })).not.toBeChecked();
});

test("unknown write result blocks duplicates until a server read and explicit resolution", async () => {
  await open(); changeNote(); review(); accept(); api.requestWithCsrf.mockRejectedValueOnce(new TypeError("private provider failure")); fireEvent.click(save());
  await screen.findByRole("button", { name: "בדיקת הגרסה בשרת" }); expect(save()).toBeDisabled(); expect(document.body).not.toHaveTextContent("private provider failure");
  fireEvent.click(screen.getByRole("button", { name: "בדיקת הגרסה בשרת" })); await screen.findByRole("button", { name: "להמשיך עם הפרטים שלי לבדיקה מחדש" });
  expect(api.requestWithCsrf).toHaveBeenCalledTimes(1); fireEvent.click(screen.getByRole("button", { name: "להחליף את העריכות שלי בגרסת השרת" }));
  review(); expect(document.body).not.toHaveTextContent("עריכה מקומית"); expect(save()).toBeDisabled();
});

test.each(["PHONE_NOT_VERIFIED", "POLICY_ACCEPTANCE_REQUIRED"])("recoverable403 %s preserves owner draft and offers account action after read", async (errorCode) => {
  await open(); changeNote(); review(); accept(); api.requestWithCsrf.mockRejectedValueOnce(new MovelyApiError("private", { status: 403, errorCode })); fireEvent.click(save());
  await screen.findByRole("button", { name: "בדיקת הגרסה בשרת" }); expect(document.body).toHaveTextContent("עריכה מקומית");
  if (errorCode === "PHONE_NOT_VERIFIED") context.user.phoneVerified = false; else context.user.hasCurrentPolicyAcceptance = false;
  fireEvent.click(screen.getByRole("button", { name: "בדיקת הגרסה בשרת" })); await screen.findByRole("link", { name: "השלמת אימות ואישורים (בכרטיסייה חדשה)" }); expect(save()).toBeDisabled();
});

test("preflight and write lock controls, so captured payload cannot overwrite new edits", async () => {
  await open(); changeNote(); review(); accept(); const pending = deferred<PublishedEditContext["user"]>(); api.getCurrentUser.mockReturnValueOnce(pending.promise); fireEvent.click(save());
  expect(screen.getByRole("checkbox", { name: /אני מאשר/ })).toBeDisabled(); expect(screen.getByRole("button", { name: "חזרה", exact: true })).toBeDisabled();
  expect(within(screen.getByRole("navigation", { name: "שלבי הבקשה" })).getByRole("button", { name: "סוג הובלה" })).toBeDisabled();
  await act(async () => pending.resolve(context.user)); await screen.findByRole("heading", { name: "השינויים נשמרו" }); expect(api.requestWithCsrf).toHaveBeenCalledTimes(1);
});

test("closed legal gate allows local review but no consent or write; zero recipients never presented for consent", async () => {
  context.capabilities.policyAcceptanceAvailable = false; context.publication.maxRecipients = 0; context.request.maxLeadBuyers = 0;
  await open(); changeNote(); review(); expect(save()).toBeDisabled(); expect(screen.queryByRole("checkbox", { name: /אני מאשר/ })).not.toBeInTheDocument(); expect(api.requestWithCsrf).not.toHaveBeenCalled();
});

test("late write response after foreground logout cannot restore private DOM or claim success", async () => {
  await open(); changeNote(); review(); accept(); const pending = deferred<unknown>(); api.requestWithCsrf.mockReturnValueOnce(pending.promise); fireEvent.click(save()); await waitFor(() => expect(api.requestWithCsrf).toHaveBeenCalledTimes(1));
  api.getCurrentUser.mockResolvedValueOnce(null); foreground(); await screen.findByRole("button", { name: "בדיקה מחדש", exact: true });
  await act(async () => pending.resolve({ ...context.request, currentVersion: { ...context.request.currentVersion, id: nextVersionId, versionNumber: 4 } }));
  expect(document.body).not.toHaveTextContent("עריכה מקומית"); expect(screen.queryByRole("heading", { name: "השינויים נשמרו" })).not.toBeInTheDocument();
});

test("category change retains both local groups until final confirmation and replaces only target content on save", async () => {
  await open(); fireEvent.click(screen.getByRole("button", { name: /הובלה קטנה \/ פריטים בודדים/ }));
  step("פריטים"); fireEvent.click(screen.getByRole("button", { name: "הוסיפו פריט נוסף" }));
  step("סוג הובלה"); fireEvent.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה/ }));
  step("תכולת הדירה"); expect(screen.getByRole("button", { name: "3 חדרים", exact: true })).toHaveAttribute("aria-pressed", "true");
  step("סוג הובלה"); fireEvent.click(screen.getByRole("button", { name: /הובלה קטנה \/ פריטים בודדים/ }));
  step("פריטים"); expect(screen.getByRole("spinbutton", { name: "כמות בפריט 1" })).toHaveValue(1);
  review(); accept(); expect(save()).toBeDisabled(); fireEvent.click(screen.getByRole("checkbox", { name: /בדקתי את שינוי הסוג/ })); expect(save()).toBeEnabled(); fireEvent.click(save());
  await screen.findByRole("heading", { name: "השינויים נשמרו" });
  expect(api.requestWithCsrf.mock.calls[0][1]).toMatchObject({ requestType: "SmallMove", apartmentMove: null, specialItems: context.request.currentVersion.specialItems });
  expect(api.requestWithCsrf.mock.calls[0][1].smallMoveItems).toHaveLength(1);
});

test.each(["maxRecipients", "disclosureVersion", "isTestOnly"] as const)("preflight %s change requires renewed review with no write", async (field) => {
  await open(); changeNote(); review(); accept();
  if (field === "maxRecipients") { context.publication.maxRecipients = 9; context.request.maxLeadBuyers = 9; }
  else if (field === "disclosureVersion") context.publication.disclosureVersion = "other-policy";
  else context.publication.isTestOnly = false;
  fireEvent.click(save()); await screen.findByRole("button", { name: "להמשיך עם הפרטים שלי לבדיקה מחדש" }); expect(api.requestWithCsrf).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "להמשיך עם הפרטים שלי לבדיקה מחדש" })); expect(save()).toBeDisabled();
  if (field === "maxRecipients") expect(screen.getByRole("checkbox", { name: /לעד 9 עסקים/ })).not.toBeChecked();
});

test("terminal transition keeps local data readable but locks fields and cannot reopen the request", async () => {
  await open(); changeNote(); review(); accept(); context.request.status = "Closed"; context.publication.requestStatus = "Closed";
  foreground(); await screen.findByRole("heading", { name: "הבקשה אינה פתוחה לעריכה" }); expect(document.body).toHaveTextContent("עריכה מקומית"); expect(save()).toBeDisabled();
  changeNote("cannot change"); expect(screen.getByRole("textbox", { name: "הערות (רשות)" })).toBeDisabled(); expect(api.requestWithCsrf).not.toHaveBeenCalled();
});

test("legacy Published status uses the same editor and remains server-authoritative", async () => {
  context.request.status = "Published"; context.publication.requestStatus = "Published";
  await open(); changeNote(); review(); accept(); fireEvent.click(save()); await screen.findByRole("heading", { name: "השינויים נשמרו" });
  expect(api.requestWithCsrf).toHaveBeenCalledTimes(1); expect(api.publishMoveRequest).not.toHaveBeenCalled();
});

test("unsaved content warns before leaving; initial untouched content does not", async () => {
  await open(); const clean = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(clean); expect(clean.defaultPrevented).toBe(false);
  changeNote(); const dirty = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(dirty); expect(dirty.defaultPrevented).toBe(true);
});
