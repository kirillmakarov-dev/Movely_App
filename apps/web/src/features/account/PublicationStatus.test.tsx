import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MovelyApiError, type MoveRequestResponse } from "@/lib/movely-api";
import type { RenewContactSharingResult, RequestPublicationStatus } from "@/lib/request-publication-api";
import PublicationStatus from "./PublicationStatus";
import OwnedRequestDetails from "./OwnedRequestDetails";
import { publication, acceptedPublication, publicationOwnerRequest } from "./publication.test-fixtures";
const api = vi.hoisted(() => ({ status: vi.fn(), renew: vi.fn(), owner: vi.fn(), close: vi.fn(), cancel: vi.fn() }));
vi.mock("@/lib/request-publication-api", async () => ({ ...await vi.importActual("@/lib/request-publication-api"), getRequestPublicationStatus: api.status, renewRequestContactSharing: api.renew }));
vi.mock("@/lib/movely-api", async () => ({ ...await vi.importActual("@/lib/movely-api"), getMoveRequest: api.owner, closeMoveRequest: api.close, cancelMoveRequest: api.cancel }));
const refresh = vi.fn(), denied = vi.fn();
function standalone() { return render(<PublicationStatus requestId={publication.requestId} reviewedVersionId={publication.currentVersionId} requestStatus="Active" onRefreshRequest={refresh} onAccessDenied={denied} />); }

test("an active request with outdated or incomplete content links to editing instead of requesting useless consent", async () => {
  api.status.mockResolvedValue({ ...publication, canRenewContactSharing: false, blockers: ["MOVE_DATE_INVALID", "REQUEST_INCOMPLETE", "CONTACT_SHARING_REQUIRED"] });
  standalone();
  expect(await screen.findByRole("link", { name: "תיקון פרטי הבקשה" })).toHaveAttribute("href", `/request/edit/${publication.requestId}`);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
beforeEach(() => { vi.resetAllMocks(); api.status.mockResolvedValue(publication); api.renew.mockResolvedValue({ publicationStatus: acceptedPublication, alreadyAccepted: false }); api.owner.mockResolvedValue(publicationOwnerRequest); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
test("renewal starts unchecked and binds actual recipient count and the reviewed version without editing contents", async () => {
  standalone(); const checkbox = await screen.findByRole("checkbox", { name: /לעד 7 עסקים/ }); expect(checkbox).not.toBeChecked();
  const button = screen.getByRole("button", { name: "אישור העברת הפרטים לגרסה זו" }); expect(button).toBeDisabled(); expect(api.renew).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "עיון בפרטי הבקשה" })).toHaveAttribute("href", "#owned-request-content");
  fireEvent.click(checkbox); fireEvent.click(button);
  expect(await screen.findByText("האישור להעברת הפרטים נשמר עבור הגרסה שבדקתם.")).toBeVisible();
  expect(api.renew).toHaveBeenCalledExactlyOnceWith(publication.requestId, { expectedCurrentVersionId: publication.currentVersionId, contactSharing: { shareContacts: true, disclosureVersion: publication.disclosureVersion, maxRecipients: 7 } }, expect.any(AbortSignal));
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument(); expect(screen.getByRole("heading", { name: "מצב הפרסום" })).toHaveFocus();
});
test("already accepted is read-only and eligibility is not presented as delivery or contact availability", async () => {
  api.status.mockResolvedValue(acceptedPublication); standalone();
  expect(await screen.findByText(/לפי הנתונים בעת הבדיקה/)).toBeVisible(); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument(); expect(api.renew).not.toHaveBeenCalled();
  expect(screen.getByText(/אינה מבטיחה שהבקשה נצפתה/)).toBeVisible(); expect(screen.getByText(/רכישת גישה לפרטי קשר דרך האתר עדיין אינה זמינה/)).toBeVisible();
});
test("snapshot and acceptance receipts display explicit timestamps in Israel time", async () => {
  const instant = "2026-07-10T21:00:00Z"; api.status.mockResolvedValue({ ...acceptedPublication, checkedAt: instant, contactSharingAcceptedAt: instant }); const { container } = standalone();
  await screen.findByText(/לפי הנתונים בעת הבדיקה/); const times = container.querySelectorAll("time"); expect(times).toHaveLength(2);
  for (const time of times) { expect(time).toHaveAttribute("datetime", instant); expect(time).toHaveTextContent("11 ביולי 2026"); }
});
test("an empty draft has a private-draft explanation and one continuation action instead of a failure checklist", async () => {
  api.status.mockResolvedValue({ ...publication, requestStatus: "Draft", currentVersionId: null, canRenewContactSharing: false, blockers: ["REQUEST_NOT_ACTIVE", "PUBLICATION_MISSING", "REQUEST_VERSION_INVALID", "MOVE_DATE_INVALID", "REQUEST_INCOMPLETE", "CONTACT_SHARING_REQUIRED", "PHONE_NOT_VERIFIED"] });
  render(<PublicationStatus requestId={publication.requestId} reviewedVersionId={null} requestStatus="Draft" onRefreshRequest={refresh} onAccessDenied={denied} />);
  expect(await screen.findByText(/כטיוטה פרטית/)).toBeVisible(); expect(screen.getByRole("link", { name: "השלמת הטיוטה לקראת פרסום" })).toHaveAttribute("href", `/request/new?requestId=${publication.requestId}`);
  expect(screen.queryByRole("list")).not.toBeInTheDocument(); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument(); expect(screen.queryByRole("link", { name: /אימות טלפון/ })).not.toBeInTheDocument();
});
test.each([["Closed", "הבקשה סגורה"], ["Cancelled", "הבקשה בוטלה"], ["Expired", "תוקף הבקשה פג"], ["Published", "מצב פרסום קודם"]] as const)("%s explains lifecycle without offering renewal or missing-consent failure list", async (requestStatus, explanation) => {
  api.status.mockResolvedValue({ ...publication, requestStatus, canRenewContactSharing: false, blockers: ["REQUEST_NOT_ACTIVE", "MOVE_DATE_INVALID", "CONTACT_SHARING_REQUIRED"] });
  render(<PublicationStatus requestId={publication.requestId} reviewedVersionId={publication.currentVersionId} requestStatus={requestStatus} onRefreshRequest={refresh} onAccessDenied={denied} />);
  expect(await screen.findByText((content) => content.includes(explanation))).toBeVisible(); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument(); expect(screen.queryByRole("list")).not.toBeInTheDocument();
});
test("closed legal service takes priority over account and sharing prompts", async () => {
  api.status.mockResolvedValue({ ...publication, canRenewContactSharing: false, blockers: ["LEGAL_NOT_READY", "POLICY_ACCEPTANCE_REQUIRED", "PHONE_NOT_VERIFIED", "CONTACT_SHARING_REQUIRED"] }); standalone();
  expect(await screen.findByText(/הפרסום לציבור עדיין אינו פתוח/)).toBeVisible(); expect(screen.getAllByRole("listitem")).toHaveLength(1); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument(); expect(screen.queryByRole("link", { name: /אימות טלפון/ })).not.toBeInTheDocument();
});
test("a newer server request version requires reviewing refreshed owner details before consent", async () => {
  api.status.mockResolvedValue({ ...publication, currentVersionId: "dddddddd-1111-4111-8111-111111111111" }); standalone();
  fireEvent.click(await screen.findByRole("button", { name: "רענון פרטי הבקשה" })); expect(refresh).toHaveBeenCalledOnce(); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
test.each([{ disclosureVersion: "approved-new-policy" }, { isTestOnly: false }])("unknown disclosure wording cannot be accepted with old page text: %j", async (changes) => {
  api.status.mockResolvedValue({ ...publication, ...changes }); standalone(); await screen.findByRole("link", { name: "טעינת העמוד המעודכן" }); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument(); expect(api.renew).not.toHaveBeenCalled();
});
test.each([0, -1])("invalid legacy recipient count %s is explained without showing a consent checkbox", async (maxRecipients) => {
  api.status.mockResolvedValue({ ...publication, maxRecipients, canRenewContactSharing: false, blockers: ["RECIPIENT_LIMIT_INVALID"] }); standalone(); await screen.findByText(/מגבלת העסקים לבקשה אינה תקינה/); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
test("phone and policy blockers provide a new-tab account action and explicit return recheck", async () => {
  api.status.mockResolvedValue({ ...publication, canRenewContactSharing: false, blockers: ["PHONE_NOT_VERIFIED", "POLICY_ACCEPTANCE_REQUIRED", "CONTACT_SHARING_REQUIRED"] }); standalone();
  expect(await screen.findByRole("link", { name: /אימות טלפון ואישור תנאים/ })).toHaveAttribute("target", "_blank"); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "בדיקת מצב הבקשה מחדש" })); expect(refresh).toHaveBeenCalledOnce();
});
test("a conflicting consent history has no renewal retry form or leaked identifiers", async () => {
  api.status.mockResolvedValue({ ...publication, canRenewContactSharing: false, blockers: ["CONTACT_SHARING_HISTORY_CONFLICT"], foreignOwnerId: "private-foreign" }); const { container } = standalone();
  await screen.findByText(/אישור חוזר לא יפתור/); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument(); expect(container.innerHTML).not.toContain("private-foreign");
});
test("an uncertain write requires reading the stored status and never resends automatically", async () => {
  api.renew.mockRejectedValue(new MovelyApiError("private timeout", { status: 0, errorCode: "CONTACT_SHARING_TIMEOUT" })); standalone();
  fireEvent.click(await screen.findByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "אישור העברת הפרטים לגרסה זו" }));
  expect(await screen.findByRole("heading", { name: "לא ידוע אם האישור נשמר" })).toHaveFocus(); expect(screen.getByRole("checkbox")).not.toBeChecked(); expect(screen.getByRole("checkbox")).toBeDisabled();
  api.status.mockResolvedValue(acceptedPublication); fireEvent.click(screen.getByRole("button", { name: "בדיקת האישור השמור" })); await screen.findByText("קיים אישור עדכני להעברת פרטים עבור הגרסה הזאת."); expect(api.renew).toHaveBeenCalledOnce(); expect(api.status).toHaveBeenCalledTimes(2);
});
test("a stale write requires full owner review, not an immediate second POST", async () => {
  api.renew.mockRejectedValue(new MovelyApiError("private", { status: 409, errorCode: "REQUEST_VERSION_CONFLICT" })); standalone();
  fireEvent.click(await screen.findByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "אישור העברת הפרטים לגרסה זו" }));
  fireEvent.click(await screen.findByRole("button", { name: "רענון הבקשה לפני אישור נוסף" })); expect(refresh).toHaveBeenCalledOnce(); expect(api.renew).toHaveBeenCalledOnce();
});
test.each(["PHONE_NOT_VERIFIED", "POLICY_ACCEPTANCE_REQUIRED"] as const)("renewal HTTP403 %s preserves owner access and leads to account recovery", async (errorCode) => {
  api.renew.mockRejectedValue(new MovelyApiError("private", { status: 403, errorCode })); render(<OwnedRequestDetails requestId={publication.requestId} />);
  fireEvent.click(await screen.findByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "אישור העברת הפרטים לגרסה זו" }));
  const review = await screen.findByRole("button", { name: "רענון הבקשה לפני אישור נוסף" }); expect(screen.getByText("כתובת פרטית 17")).toBeVisible(); expect(screen.queryByRole("heading", { name: "אין גישה לבקשה בחשבון הזה" })).not.toBeInTheDocument();
  api.status.mockResolvedValue({ ...publication, canRenewContactSharing: false, blockers: [errorCode, "CONTACT_SHARING_REQUIRED"] }); fireEvent.click(review);
  expect(await screen.findByRole("link", { name: /אימות טלפון ואישור תנאים/ })).toHaveAttribute("target", "_blank"); expect(screen.getByText("כתובת פרטית 17")).toBeVisible(); expect(api.renew).toHaveBeenCalledOnce();
});
test("pending renewal blocks duplicate writes and aborts on unmount", async () => {
  const pending = deferred<RenewContactSharingResult>(); api.renew.mockReturnValue(pending.promise); const { unmount } = standalone();
  fireEvent.click(await screen.findByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "אישור העברת הפרטים לגרסה זו" })); fireEvent.click(screen.getByRole("button", { name: "שומרים את האישור…" }));
  expect(api.renew).toHaveBeenCalledOnce(); const signal = api.renew.mock.calls[0][2] as AbortSignal; unmount(); expect(signal.aborted).toBe(true); await act(async () => pending.resolve({ publicationStatus: acceptedPublication, alreadyAccepted: false }));
});
test("status timeout aborts stale reads and a retry cannot be overwritten by a late response", async () => {
  vi.useFakeTimers(); const pending = deferred<RequestPublicationStatus>(); api.status.mockReturnValueOnce(pending.promise); standalone(); const signal = api.status.mock.calls[0][1] as AbortSignal;
  await act(async () => vi.advanceTimersByTime(10_000)); expect(signal.aborted).toBe(true); expect(screen.getByRole("alert")).toHaveTextContent("זמן רב מדי");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "בדיקת הפרסום מחדש" }))); expect(screen.getByRole("checkbox")).toBeVisible();
  await act(async () => pending.resolve(acceptedPublication)); expect(screen.getByRole("checkbox")).toBeVisible();
});
test("owner integration renews against actual displayed contents and resets choice after recipient or version changes", async () => {
  render(<OwnedRequestDetails requestId={publication.requestId} />); expect(await screen.findByText("כתובת פרטית 17")).toBeVisible(); fireEvent.click(await screen.findByRole("checkbox"));
  api.owner.mockResolvedValue({ ...publicationOwnerRequest, maxLeadBuyers: 9 }); api.status.mockResolvedValue({ ...publication, maxRecipients: 9 });
  fireEvent.click(screen.getByRole("button", { name: "בדיקת מצב הבקשה מחדש" })); expect(await screen.findByRole("checkbox", { name: /לעד 9 עסקים/ })).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox")); const nextVersion = "dddddddd-1111-4111-8111-111111111111";
  api.owner.mockResolvedValue({ ...publicationOwnerRequest, currentVersion: { ...publicationOwnerRequest.currentVersion!, id: nextVersion } }); api.status.mockResolvedValue({ ...publication, currentVersionId: nextVersion });
  fireEvent.click(screen.getByRole("button", { name: "בדיקת מצב הבקשה מחדש" })); expect(await screen.findByRole("checkbox")).not.toBeChecked(); expect(api.renew).not.toHaveBeenCalled();
});
test("publication authorization failure hides all parent owner data, not only the consent panel", async () => {
  const pending = deferred<RequestPublicationStatus>(); api.status.mockReturnValue(pending.promise); render(<OwnedRequestDetails requestId={publication.requestId} />); await screen.findByText("כתובת פרטית 17");
  await waitFor(() => expect(api.status).toHaveBeenCalledOnce());
  await act(async () => pending.reject(new MovelyApiError("private", { status: 403, errorCode: "FORBIDDEN" })));
  await screen.findByRole("heading", { name: "אין גישה לבקשה בחשבון הזה" }); expect(screen.queryByText("כתובת פרטית 17")).not.toBeInTheDocument(); expect(screen.queryByText("הערה פרטית")).not.toBeInTheDocument();
});
test("foreground logout hides owner details immediately and late renewed consent cannot revive them", async () => {
  const pending = deferred<RenewContactSharingResult>(); api.renew.mockReturnValue(pending.promise); render(<OwnedRequestDetails requestId={publication.requestId} />);
  fireEvent.click(await screen.findByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "אישור העברת הפרטים לגרסה זו" })); const signal = api.renew.mock.calls[0][2] as AbortSignal;
  api.owner.mockRejectedValue(new MovelyApiError("private", { status: 401, errorCode: "AUTH" })); fireEvent.blur(window); fireEvent.focus(window);
  expect(screen.queryByText("כתובת פרטית 17")).not.toBeInTheDocument(); expect(signal.aborted).toBe(true); await screen.findByRole("heading", { name: "התחברו כדי לצפות בבקשה" });
  await act(async () => pending.resolve({ publicationStatus: acceptedPublication, alreadyAccepted: false })); expect(screen.queryByText("כתובת פרטית 17")).not.toBeInTheDocument(); expect(screen.queryByText(/האישור להעברת הפרטים נשמר/)).not.toBeInTheDocument();
});
test("a late close action cannot restore private data after a foreground account change", async () => {
  const pending = deferred<MoveRequestResponse>(); api.close.mockReturnValue(pending.promise); render(<OwnedRequestDetails requestId={publication.requestId} />); await screen.findByRole("checkbox");
  fireEvent.click(screen.getByRole("button", { name: "סיום חיפוש מוביל" })); fireEvent.click(screen.getByRole("button", { name: "אישור סיום החיפוש" }));
  api.owner.mockRejectedValue(new MovelyApiError("private", { status: 404, errorCode: "NOT_FOUND" })); fireEvent.blur(window); fireEvent.focus(window); await screen.findByRole("heading", { name: "הבקשה לא נמצאה" });
  await act(async () => pending.resolve({ ...publicationOwnerRequest, status: "Closed" })); expect(screen.queryByText("כתובת פרטית 17")).not.toBeInTheDocument(); expect(screen.queryByText(/חיפוש המוביל נסגר/)).not.toBeInTheDocument();
});
