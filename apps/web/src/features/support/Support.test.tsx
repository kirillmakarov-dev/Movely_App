import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MovelyApiError, type CurrentUser } from "@/lib/movely-api";
import { type SupportCommand, type SupportDetail } from "@/lib/support-api";
import { supportDetail, supportId, supportUser, nextSupportRevision } from "./support.test-fixtures";
import NewSupportRequest from "./NewSupportRequest";
import SupportRequestDetails from "./SupportRequestDetails";
import SupportRequests from "./SupportRequests";
const api = vi.hoisted(() => ({ getSupportCapabilities: vi.fn(), getSupportRequests: vi.fn(), getSupportRequest: vi.fn(), createSupportRequest: vi.fn(), findSupportSubmission: vi.fn(), sendSupportCommand: vi.fn() }));
const currentUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/support-api", async () => ({ ...await vi.importActual("@/lib/support-api"), ...api }));
vi.mock("@/lib/movely-api", async () => ({ ...await vi.importActual("@/lib/movely-api"), getCurrentUser: currentUser }));
let detail: SupportDetail; let user: CurrentUser; let enabled: boolean;
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
beforeEach(() => {
  vi.resetAllMocks(); detail = supportDetail(); user = { ...supportUser }; enabled = true;
  currentUser.mockImplementation(async () => user); api.getSupportCapabilities.mockImplementation(async () => ({ requestsEnabled: enabled }));
  api.getSupportRequest.mockImplementation(async () => structuredClone(detail)); api.getSupportRequests.mockImplementation(async () => ({ items: [structuredClone(detail)], page: 1, pageSize: 12, totalCount: 1 }));
  api.createSupportRequest.mockImplementation(async (input) => ({ request: { ...detail, clientMutationId: input.clientMutationId, type: input.type, subject: input.subject }, alreadyCreated: false }));
  api.sendSupportCommand.mockImplementation(async (audience: string, _id: string, command: SupportCommand) => {
    const status = command.kind === "cancel" ? "Cancelled" : command.kind === "status" ? "InReview" : audience === "admin" ? command.status! : ["WaitingForUser", "Resolved"].includes(detail.status) ? "Open" : detail.status;
    detail = { ...detail, status, revisionId: nextSupportRevision, history: { ...detail.history, items: [{ id: crypto.randomUUID(), clientMutationId: command.clientMutationId, actor: audience === "admin" ? "Support" : "Owner", kind: command.kind === "reply" ? "Message" : command.kind === "cancel" ? "Cancelled" : "StatusChanged", sequenceNumber: 2, body: command.kind === "reply" ? command.body : null, previousStatus: detail.status, status, revisionId: nextSupportRevision, createdAt: "2026-10-29T13:00:00Z" }, ...detail.history.items], totalCount: 2 } };
    return { request: structuredClone(detail), alreadyApplied: false, eventId: detail.history.items[0].id };
  });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
async function openNew() { render(<NewSupportRequest />); await screen.findByRole("heading", { name: "פנייה חדשה" }); }
function fillNew() { fireEvent.change(screen.getByRole("textbox", { name: "כותרת קצרה" }), { target: { value: "כותרת מקומית פרטית" } }); fireEvent.change(screen.getByRole("textbox", { name: "מה תרצו שנבדוק?" }), { target: { value: "טקסט מקומי שלא נשלח" } }); }
function submitNew() { fireEvent.click(screen.getByRole("button", { name: "בדיקת הפנייה לפני שליחה" })); fireEvent.click(screen.getByRole("button", { name: "אישור ושליחת הפנייה" })); }
async function openDetail(admin = false) { if (admin) { user.role = "Admin"; user.id = "99999999-1111-4111-8111-111111111111"; detail = supportDetail(true); } render(<SupportRequestDetails audience={admin ? "admin" : "owner"} requestId={supportId} />); await screen.findByRole("heading", { name: detail.subject }); }
function fillReply(value = "תשובה מקומית פרטית") { fireEvent.change(screen.getByRole("textbox", { name: "תוכן ההודעה" }), { target: { value } }); }
function sendReply() { fireEvent.click(screen.getByRole("button", { name: "בדיקת ההודעה לפני שליחה" })); fireEvent.click(screen.getByRole("button", { name: "אישור ושליחת ההודעה" })); }
function foreground() { fireEvent.blur(window); fireEvent.focus(window); }

test.each(["Customer", "Mover"] as const)("%s can record privacy request without phone/current policy gates, after explicit confirmation", async (role) => {
  user.role = role; const storage = vi.spyOn(Storage.prototype, "setItem"); await openNew(); fillNew(); fireEvent.change(screen.getByRole("combobox", { name: "נושא הפנייה" }), { target: { value: "PrivacyDeletion" } });
  fireEvent.click(screen.getByRole("button", { name: "בדיקת הפנייה לפני שליחה" })); expect(api.createSupportRequest).not.toHaveBeenCalled(); expect(screen.getByRole("group", { name: "אישור שליחת הפנייה" })).toHaveTextContent("שליחה אינה מבצעת שינוי או מחיקה");
  fireEvent.click(screen.getByRole("button", { name: "אישור ושליחת הפנייה" })); await screen.findByRole("heading", { name: "הפנייה נרשמה" });
  expect(api.createSupportRequest).toHaveBeenCalledTimes(1); expect(api.createSupportRequest.mock.calls[0][0]).toMatchObject({ type: "PrivacyDeletion", subject: "כותרת מקומית פרטית", message: "טקסט מקומי שלא נשלח" }); expect(storage).not.toHaveBeenCalled(); expect(document.body).not.toHaveTextContent("המידע נמחק");
});
test("validation focuses the first invalid field and disabled capability prevents submission", async () => {
  await openNew(); fireEvent.click(screen.getByRole("button", { name: "בדיקת הפנייה לפני שליחה" })); expect(screen.getByRole("textbox", { name: "כותרת קצרה" })).toHaveFocus(); expect(screen.getByRole("textbox", { name: "כותרת קצרה" })).toHaveAttribute("aria-invalid", "true");
  enabled = false; foreground(); await screen.findByRole("heading", { name: "פנייה חדשה" }); expect(screen.getByRole("button", { name: "בדיקת הפנייה לפני שליחה" })).toBeDisabled(); expect(api.createSupportRequest).not.toHaveBeenCalled();
});
test("unknown create is checked by the original token;404 keeps locked body and explicit retry reuses exact intent", async () => {
  await openNew(); fillNew(); api.createSupportRequest.mockRejectedValueOnce(new TypeError("private failure")); submitNew();
  await screen.findByRole("heading", { name: "צריך לבדוק אם הפנייה נרשמה" }); const input = api.createSupportRequest.mock.calls[0][0];
  api.findSupportSubmission.mockResolvedValue(null); fireEvent.click(screen.getByRole("button", { name: "בדיקת רישום הפנייה" })); await screen.findByText(/הפנייה עדיין לא נמצאה בבדיקה/);
  expect(api.findSupportSubmission).toHaveBeenCalledWith(input.clientMutationId, expect.any(AbortSignal)); expect(screen.getByRole("textbox", { name: "מה תרצו שנבדוק?" })).toBeDisabled(); expect(api.createSupportRequest).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "ניסיון נוסף לאותה פנייה" })); fireEvent.click(screen.getByRole("button", { name: "אישור ניסיון נוסף לאותה פנייה" })); await screen.findByRole("heading", { name: "הפנייה נרשמה" }); expect(api.createSupportRequest.mock.calls[1][0]).toEqual(input); expect(document.body).not.toHaveTextContent("private failure");
});
test("found create receipt resolves uncertainty without another POST", async () => {
  await openNew(); fillNew(); api.createSupportRequest.mockRejectedValueOnce(new TypeError("offline")); submitNew(); await screen.findByRole("button", { name: "בדיקת רישום הפנייה" }); const input = api.createSupportRequest.mock.calls[0][0];
  api.findSupportSubmission.mockResolvedValue({ ...detail, ...input }); fireEvent.click(screen.getByRole("button", { name: "בדיקת רישום הפנייה" })); await screen.findByRole("heading", { name: "הפנייה נרשמה" }); expect(api.createSupportRequest).toHaveBeenCalledTimes(1);
});
test("foreground hides private draft while checking, preserves sameaccount input, then clears it on logout", async () => {
  await openNew(); fillNew(); const pending = deferred<CurrentUser>(); currentUser.mockReturnValueOnce(pending.promise); foreground(); expect(document.body).not.toHaveTextContent("כותרת מקומית פרטית"); expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); fireEvent.focus(window); expect(currentUser).toHaveBeenCalledTimes(2);
  await act(async () => pending.resolve(user)); expect(await screen.findByRole("textbox", { name: "כותרת קצרה" })).toHaveValue("כותרת מקומית פרטית");
  currentUser.mockResolvedValueOnce(null); foreground(); await screen.findByRole("button", { name: "בדיקה מחדש" }); expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "בדיקה מחדש" })); expect(await screen.findByRole("textbox", { name: "כותרת קצרה" })).toHaveValue("");
});
test("owner historical read and cancellation work while submissions are disabled", async () => {
  enabled = false; await openDetail(); expect(document.body).toHaveTextContent("מידע פרטי בפנייה"); expect(screen.queryByRole("textbox", { name: "תוכן ההודעה" })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "ביטול הפנייה", exact: true })); expect(api.sendSupportCommand).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "אישור ביטול הפנייה" })); await screen.findByText("הפנייה בוטלה. ההיסטוריה נשארת זמינה."); expect(api.sendSupportCommand.mock.calls[0][2]).toMatchObject({ kind: "cancel", expectedRevisionId: "bbbbbbbb-1111-4111-8111-111111111111" });
});
test("resolved owner reply reopens the conversation, while cancelled request is read-only", async () => {
  detail.status = "Resolved"; await openDetail(); fillReply(); sendReply(); await screen.findByText("ההודעה נרשמה בפנייה."); expect(detail.status).toBe("Open"); cleanup(); detail.status = "Cancelled"; await openDetail(); expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "ביטול הפנייה", exact: true })).not.toBeInTheDocument();
});
test("revision conflict preserves reply and requires an actual read plus explicit review", async () => {
  await openDetail(); fillReply(); api.sendSupportCommand.mockRejectedValueOnce(new MovelyApiError("private", { status: 409, errorCode: "SUPPORT_REVISION_CONFLICT" })); sendReply();
  const acknowledge = await screen.findByRole("button", { name: "קראתי את המצב המוצג, להמשך בדיקה" }); expect(acknowledge).toBeDisabled(); expect(screen.getByRole("textbox", { name: "תוכן ההודעה" })).toHaveValue("תשובה מקומית פרטית");
  detail.revisionId = nextSupportRevision; fireEvent.click(screen.getByRole("button", { name: "טעינת המצב העדכני" })); await screen.findByRole("heading", { name: detail.subject }); fireEvent.click(screen.getByRole("button", { name: "קראתי את המצב המוצג, להמשך בדיקה" })); expect(screen.getByRole("textbox", { name: "תוכן ההודעה" })).toBeEnabled(); expect(api.sendSupportCommand).toHaveBeenCalledTimes(1);
});
test("unknown reply never resends on history refresh; exact frozen command is reused only explicitly", async () => {
  await openDetail(); fillReply(); api.sendSupportCommand.mockRejectedValueOnce(new TypeError("offline")); sendReply(); await screen.findByRole("heading", { name: "צריך לבדוק אם הפעולה נרשמה" }); const sent = api.sendSupportCommand.mock.calls[0][2];
  fireEvent.click(screen.getByRole("button", { name: "בדיקת ההיסטוריה העדכנית" })); await screen.findByRole("heading", { name: detail.subject }); expect(api.sendSupportCommand).toHaveBeenCalledTimes(1); expect(screen.getByRole("textbox", { name: "תוכן ההודעה" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "ניסיון נוסף לאותה פעולה" })); fireEvent.click(screen.getByRole("button", { name: "אישור ניסיון נוסף לאותה פעולה" })); await screen.findByText("ההודעה נרשמה בפנייה."); expect(api.sendSupportCommand.mock.calls[1][2]).toEqual(sent);
});
test("administrator must choose status and confirm public response; disabled service still permits InReview assignment", async () => {
  await openDetail(true); fillReply("תשובת הצוות"); fireEvent.click(screen.getByRole("button", { name: "בדיקת ההודעה לפני שליחה" })); expect(screen.getByRole("combobox", { name: /מצב לאחר המענה/ })).toHaveFocus();
  fireEvent.change(screen.getByRole("combobox", { name: /מצב לאחר המענה/ }), { target: { value: "WaitingForUser" } }); sendReply(); await screen.findByText("ההודעה נרשמה בפנייה."); expect(api.sendSupportCommand.mock.calls[0][2]).toMatchObject({ kind: "reply", body: "תשובת הצוות", status: "WaitingForUser" });
  enabled = false; foreground(); await screen.findByRole("heading", { name: detail.subject }); expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "העברה לטיפול הצוות" })); fireEvent.click(screen.getByRole("button", { name: "אישור העברה לטיפול" })); await screen.findByText("הפנייה הועברה לטיפול הצוות.");
});
test("capability change while reply confirmation is open removes the stale send action", async () => {
  await openDetail(); fillReply(); fireEvent.click(screen.getByRole("button", { name: "בדיקת ההודעה לפני שליחה" })); enabled = false; foreground(); await screen.findByRole("heading", { name: detail.subject }); expect(screen.queryByRole("button", { name: "אישור ושליחת ההודעה" })).not.toBeInTheDocument(); expect(api.sendSupportCommand).not.toHaveBeenCalled();
});
test("real list uses URL filters/pagination and unknownowner/admin never sees request text", async () => {
  render(<SupportRequests audience="owner" search={{ type: "PrivacyDeletion", status: "Open", page: 1, pageSize: 12 }} />); await screen.findByRole("heading", { name: "הפניות שלי" }); expect(api.getSupportRequests).toHaveBeenCalledWith("owner", { type: "PrivacyDeletion", status: "Open", page: 1, pageSize: 12 }, expect.any(AbortSignal)); expect(screen.getByRole("combobox", { name: "נושא", exact: true }).closest("form")).toHaveAttribute("method", "get"); expect(document.body).not.toHaveTextContent("מידע פרטי בפנייה"); cleanup();
  render(<SupportRequestDetails audience="admin" requestId={supportId} />); await screen.findByRole("alert"); expect(document.body).not.toHaveTextContent(detail.subject); expect(api.getSupportRequest).not.toHaveBeenCalled();
});
test("duplicate clicks and delayed response after logout cannot restore private receipt", async () => {
  await openNew(); fillNew(); const pending = deferred<unknown>(); api.createSupportRequest.mockReturnValueOnce(pending.promise); submitNew(); await waitFor(() => expect(api.createSupportRequest).toHaveBeenCalledTimes(1)); expect(screen.getByRole("textbox", { name: "כותרת קצרה" })).toBeDisabled();
  currentUser.mockResolvedValueOnce(null); foreground(); await screen.findByRole("alert"); await act(async () => pending.resolve({ request: detail, alreadyCreated: false })); expect(screen.queryByRole("heading", { name: "הפנייה נרשמה" })).not.toBeInTheDocument(); expect(document.body).not.toHaveTextContent("כותרת מקומית פרטית");
});
test("history pagination is real and plain text is escaped", async () => {
  detail.history = { ...detail.history, page: 2, totalCount: 120, items: [{ ...detail.history.items[0], body: '<img src=x onerror="alert(1)">' }] };
  render(<SupportRequestDetails audience="owner" requestId={supportId} historyPage={2} />); await screen.findByRole("heading", { name: detail.subject }); expect(api.getSupportRequest).toHaveBeenCalledWith("owner", supportId, 2, expect.any(AbortSignal)); expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument(); expect(document.querySelector("img")).toBeNull(); expect(within(screen.getByRole("navigation", { name: "עמודי היסטוריית הפנייה" })).getByRole("link", { name: "להודעות קודמות" })).toHaveAttribute("href", `/account/support/${supportId}?page=3`); expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

test("expected actor is frozen into create; server account-change rejection clears private draft", async () => {
  await openNew(); fillNew(); const reviewedActor = user.id;
  api.createSupportRequest.mockRejectedValueOnce(new MovelyApiError("private server text", { status: 403, errorCode: "SUPPORT_ACCOUNT_CHANGED" })); submitNew();
  await screen.findByRole("button", { name: "בדיקה מחדש" }); expect(api.createSupportRequest.mock.calls[0][0].expectedActorUserId).toBe(reviewedActor); expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); expect(document.body).not.toHaveTextContent("טקסט מקומי שלא נשלח"); expect(document.body).not.toHaveTextContent("private server text");
});
test("administrator reply remains in memory on same-account recheck, but requires review after concurrent revision", async () => {
  await openDetail(true); fillReply("הערת מפעיל שטרם נשלחה"); fireEvent.change(screen.getByRole("combobox", { name: /מצב לאחר המענה/ }), { target: { value: "Resolved" } });
  const pending = deferred<CurrentUser>(); currentUser.mockReturnValueOnce(pending.promise); foreground(); expect(document.body).not.toHaveTextContent(detail.subject); expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); detail.revisionId = nextSupportRevision;
  await act(async () => pending.resolve(user)); expect(await screen.findByRole("textbox", { name: "תוכן ההודעה" })).toHaveValue("הערת מפעיל שטרם נשלחה"); expect(screen.getByRole("textbox", { name: "תוכן ההודעה" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "קראתי את המצב המוצג, להמשך בדיקה" })); expect(screen.getByRole("combobox", { name: /מצב לאחר המענה/ })).toHaveValue(""); expect(api.sendSupportCommand).not.toHaveBeenCalled();
});
test("hidden focus does not load; visible/BFcache return rechecks and preserves same-user draft", async () => {
  await openNew(); fillNew(); const visibility = vi.spyOn(document, "visibilityState", "get"); visibility.mockReturnValue("hidden"); fireEvent(document, new Event("visibilitychange")); fireEvent.focus(window); expect(currentUser).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue("visible"); fireEvent(document, new Event("visibilitychange")); fireEvent.focus(window); await screen.findByRole("textbox", { name: "כותרת קצרה" }); expect(currentUser).toHaveBeenCalledTimes(2);
  const restored = new Event("pageshow"); Object.defineProperty(restored, "persisted", { value: true }); fireEvent(window, restored); expect(await screen.findByRole("textbox", { name: "כותרת קצרה" })).toHaveValue("כותרת מקומית פרטית"); expect(currentUser).toHaveBeenCalledTimes(3);
});
test("a similar Support history event is not an authoritative receipt for this administrator's unknown command", async () => {
  await openDetail(true); fillReply(); fireEvent.change(screen.getByRole("combobox", { name: /מצב לאחר המענה/ }), { target: { value: "WaitingForUser" } }); api.sendSupportCommand.mockRejectedValueOnce(new TypeError("offline")); sendReply(); await screen.findByRole("heading", { name: "צריך לבדוק אם הפעולה נרשמה" });
  const sent = api.sendSupportCommand.mock.calls[0][2]; expect(sent.expectedActorUserId).toBe(user.id);
  detail.history.items.unshift({ ...detail.history.items[0], id: nextSupportRevision, sequenceNumber: 2, clientMutationId: sent.clientMutationId, actor: "Support", kind: "Message", body: sent.body, status: "WaitingForUser" }); detail.history.totalCount = 2;
  fireEvent.click(screen.getByRole("button", { name: "בדיקת ההיסטוריה העדכנית" })); await screen.findByText(/מופיעה בהיסטוריה פעולה דומה/); expect(screen.queryByRole("button", { name: "סיום הבדיקה" })).not.toBeInTheDocument(); expect(screen.getByRole("textbox", { name: "תוכן ההודעה" })).toBeDisabled(); expect(api.sendSupportCommand).toHaveBeenCalledTimes(1);
});
test("disabled response updates capability state without discarding a known-unsubmitted draft", async () => {
  await openNew(); fillNew(); api.createSupportRequest.mockRejectedValueOnce(new MovelyApiError("disabled", { status: 503, errorCode: "SUPPORT_REQUESTS_DISABLED" })); submitNew();
  await screen.findByRole("alert"); expect(screen.getByRole("textbox", { name: "כותרת קצרה" })).toHaveValue("כותרת מקומית פרטית"); expect(screen.getByRole("button", { name: "בדיקת הפנייה לפני שליחה" })).toBeDisabled(); expect(screen.queryByRole("heading", { name: "צריך לבדוק אם הפנייה נרשמה" })).not.toBeInTheDocument();
});
test("admin status-only assignment preserves an unsent reply instead of silently discarding it", async () => {
  await openDetail(true); fillReply("טקסט שעדיין לא נשלח"); fireEvent.click(screen.getByRole("button", { name: "העברה לטיפול הצוות" })); fireEvent.click(screen.getByRole("button", { name: "אישור העברה לטיפול" }));
  await screen.findByText("הפנייה הועברה לטיפול הצוות."); expect(screen.getByRole("textbox", { name: "תוכן ההודעה" })).toHaveValue("טקסט שעדיין לא נשלח"); expect(api.sendSupportCommand.mock.calls[0][2]).not.toHaveProperty("body");
});
test("unknown write followed by authoritative revision conflict can be reviewed and deliberately resubmitted with a new key", async () => {
  await openDetail(); fillReply(); api.sendSupportCommand.mockRejectedValueOnce(new TypeError("offline")); sendReply(); await screen.findByRole("heading", { name: "צריך לבדוק אם הפעולה נרשמה" }); const first = api.sendSupportCommand.mock.calls[0][2];
  detail.revisionId = nextSupportRevision; api.sendSupportCommand.mockRejectedValueOnce(new MovelyApiError("conflict", { status: 409, errorCode: "SUPPORT_REVISION_CONFLICT" }));
  fireEvent.click(screen.getByRole("button", { name: "ניסיון נוסף לאותה פעולה" })); fireEvent.click(screen.getByRole("button", { name: "אישור ניסיון נוסף לאותה פעולה" }));
  await screen.findByRole("heading", { name: "הפנייה השתנתה מאז שהתחלתם לכתוב" }); expect(screen.queryByRole("heading", { name: "צריך לבדוק אם הפעולה נרשמה" })).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "קראתי את המצב המוצג, להמשך בדיקה" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "טעינת המצב העדכני" })); await screen.findByRole("heading", { name: detail.subject }); fireEvent.click(screen.getByRole("button", { name: "קראתי את המצב המוצג, להמשך בדיקה" }));
  expect(screen.getByRole("textbox", { name: "תוכן ההודעה" })).toHaveValue("תשובה מקומית פרטית"); sendReply(); await screen.findByText("ההודעה נרשמה בפנייה."); const last = api.sendSupportCommand.mock.calls[2][2]; expect(last.clientMutationId).not.toBe(first.clientMutationId); expect(last.expectedRevisionId).toBe(nextSupportRevision); expect(last.body).toBe(first.body);
});
