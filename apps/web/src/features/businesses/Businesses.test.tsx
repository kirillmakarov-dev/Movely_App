import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MovelyApiError } from "@/lib/movely-api";
import BusinessProfile from "./BusinessProfile";
import BusinessHome from "./BusinessHome";
import AdminBusinessDetails from "./AdminBusinessDetails";
import AdminBusinesses from "./AdminBusinesses";
import { adminBusiness, business, customer } from "./business.test-fixtures";
const api = vi.hoisted(() => ({ user: vi.fn(), capabilities: vi.fn(), cities: vi.fn(), mine: vi.fn(), save: vi.fn(), admin: vi.fn(), list: vi.fn(), review: vi.fn() }));
vi.mock("@/lib/movely-api", async () => ({ ...await vi.importActual("@/lib/movely-api"), getCurrentUser: api.user, getAuthCapabilities: api.capabilities, getLocalities: api.cities }));
vi.mock("@/lib/business-api", async () => ({ ...await vi.importActual("@/lib/business-api"), getMyBusiness: api.mine, saveBusiness: api.save, getAdminBusiness: api.admin, getAdminBusinesses: api.list, reviewBusiness: api.review }));
beforeEach(() => {
  vi.resetAllMocks(); api.user.mockResolvedValue(customer);
  api.capabilities.mockResolvedValue({ policyAcceptanceAvailable: true, phoneVerificationAvailable: true, googleSignInAvailable: false, googleClientId: null });
  api.mine.mockResolvedValue(null); api.save.mockResolvedValue(business); api.admin.mockResolvedValue(adminBusiness); api.review.mockResolvedValue({ ...adminBusiness, status: "Verified" });
  api.cities.mockResolvedValue([{ code: "4000", name: "חיפה" }, { code: "5000", name: "תל אביב - יפו" }]);
  api.list.mockResolvedValue({ items: [business], page: 1, pageSize: 12, totalCount: 1 });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function fillNewProfile() {
  await screen.findByLabelText(/^שם העסק/);
  fireEvent.change(screen.getByLabelText(/^שם העסק/), { target: { value: "הובלות בדיקה" } });
  fireEvent.change(screen.getByLabelText(/^מספר עוסק/), { target: { value: "012345678" } });
  fireEvent.change(screen.getByLabelText(/^כתובת העסק/), { target: { value: "רחוב העסק 10" } });
  fireEvent.change(screen.getByLabelText(/^שם הנציג/), { target: { value: "דנה לוי" } });
  await screen.findByRole("option", { name: "חיפה" });
  fireEvent.change(screen.getByLabelText("יישוב להוספה"), { target: { value: "4000" } });
  fireEvent.click(screen.getByRole("button", { name: "הוספת יישוב" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /אני מורשה/ }));
}
test.each([null, { ...customer, role: "Admin" }])("anonymous/admin cannot load or submit an owner profile", async (user) => {
  api.user.mockResolvedValue(user); render(<BusinessProfile />);
  await screen.findByRole("link", { name: user ? "בדיקת עסקים" : "כניסה לחשבון" });
  expect(api.mine).not.toHaveBeenCalled(); expect(api.save).not.toHaveBeenCalled();
});
test("legal capability closes applications before private form entry", async () => {
  api.capabilities.mockResolvedValue({ policyAcceptanceAvailable: false }); render(<BusinessProfile />);
  await screen.findByRole("button", { name: "בדיקת זמינות מחדש" }); expect(screen.queryByLabelText(/^שם העסק/)).not.toBeInTheDocument();
});
test("closed legal gate keeps the existing profile read-only and clears private summary on foreground logout", async () => {
  api.capabilities.mockResolvedValue({ policyAcceptanceAvailable: false }); api.mine.mockResolvedValue(business);
  render(<BusinessProfile />); await screen.findByText(business.registeredAddress!);
  expect(screen.queryByLabelText(/^שם העסק/)).not.toBeInTheDocument();
  api.user.mockResolvedValue(null); fireEvent.blur(window); fireEvent.focus(window);
  expect(screen.queryByText(business.registeredAddress!)).not.toBeInTheDocument(); expect(screen.queryByText(business.registrationNumber!)).not.toBeInTheDocument();
  expect(await screen.findByRole("link", { name: "כניסה לחשבון" })).toBeVisible(); expect(api.save).not.toHaveBeenCalled();
});
test("business home removes saved name and status immediately on foreground session recheck", async () => {
  api.mine.mockResolvedValue(business); render(<BusinessHome />); await screen.findByRole("heading", { name: business.name! });
  api.user.mockResolvedValue(null); fireEvent.blur(window); fireEvent.focus(window);
  expect(screen.queryByRole("heading", { name: business.name! })).not.toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "מתחילים עם הפרופיל העסקי" })).toBeVisible(); expect(api.mine).toHaveBeenCalledTimes(1);
});
test("new customer business uses explicit authority and canonical selected codes, without role mutation", async () => {
  render(<BusinessProfile />); await fillNewProfile();
  fireEvent.click(screen.getByRole("button", { name: "שליחת הפרופיל לבדיקה" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  expect(api.save.mock.calls[0][0]).toEqual({ name: "הובלות בדיקה", registrationNumber: "012345678", registeredAddress: "רחוב העסק 10", representativeName: "דנה לוי", serviceAreaCodes: ["4000"], authorizedRepresentative: true });
  expect(api.save.mock.calls[0][1]).toBeUndefined(); expect(customer.role).toBe("Customer");
  expect(await screen.findByText(/הפרופיל נשלח לבדיקה ידנית/)).toBeVisible();
  expect(screen.getByRole("checkbox", { name: /אני מורשה/ })).not.toBeChecked();
});
test("phone/terms recheck preserves filled fields and opens account in a new tab", async () => {
  api.user.mockResolvedValue({ ...customer, phoneVerified: false, hasCurrentPolicyAcceptance: false });
  render(<BusinessProfile />); await fillNewProfile();
  expect(screen.getByRole("button", { name: "שליחת הפרופיל לבדיקה" })).toBeDisabled();
  expect(screen.getByRole("link", { name: /אימות ואישור בחשבון/ })).toHaveAttribute("target", "_blank");
  api.user.mockResolvedValue(customer); fireEvent.click(screen.getByRole("button", { name: "בדיקת החשבון מחדש" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "שליחת הפרופיל לבדיקה" })).toBeEnabled());
  expect(screen.getByLabelText(/^שם העסק/)).toHaveValue("הובלות בדיקה"); expect(screen.getByRole("button", { name: "הסרת חיפה" })).toBeVisible(); expect(api.save).not.toHaveBeenCalled();
});
test("account change during recheck clears private fields before any write", async () => {
  render(<BusinessProfile />); await fillNewProfile(); api.user.mockResolvedValue({ ...customer, id: "other" });
  fireEvent.click(screen.getByRole("button", { name: "שליחת הפרופיל לבדיקה" }));
  await screen.findByRole("link", { name: "כניסה לחשבון" }); expect(screen.queryByLabelText(/^כתובת העסק/)).not.toBeInTheDocument(); expect(api.save).not.toHaveBeenCalled();
});
test("owner foreground checks hide private DOM, preserve same-account edits, and never revive a logged-out draft", async () => {
  render(<BusinessProfile />); await fillNewProfile();
  let resolve!: (value: typeof customer) => void;
  api.user.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  fireEvent.blur(window); fireEvent.focus(window);
  expect(screen.queryByLabelText(/^כתובת העסק/)).not.toBeInTheDocument(); expect(screen.getByRole("status")).toHaveTextContent("בודקים את החשבון");
  await act(async () => resolve(customer));
  expect(await screen.findByLabelText(/^שם העסק/)).toHaveValue("הובלות בדיקה"); expect(screen.getByRole("checkbox", { name: /אני מורשה/ })).toBeChecked();
  api.user.mockResolvedValue(null); fireEvent.blur(window); fireEvent.focus(window);
  await screen.findByRole("link", { name: "כניסה לחשבון" }); expect(screen.queryByLabelText(/^שם העסק/)).not.toBeInTheDocument();
  api.user.mockResolvedValue(customer); fireEvent.blur(window); fireEvent.focus(window); await act(async () => {});
  expect(screen.queryByLabelText(/^שם העסק/)).not.toBeInTheDocument(); expect(api.save).not.toHaveBeenCalled();
});
test("verified edit requires explicit re-verification acknowledgement and revision", async () => {
  api.mine.mockResolvedValue({ ...business, status: "Verified" }); render(<BusinessProfile />);
  await screen.findByLabelText(/^שם העסק/); fireEvent.click(screen.getByRole("checkbox", { name: /אני מורשה/ }));
  const submit = screen.getByRole("button", { name: "שליחת הפרופיל לבדיקה" }); fireEvent.submit(submit.closest("form")!);
  expect(api.save).not.toHaveBeenCalled();
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(screen.getByRole("checkbox", { name: /אני מבין/ })); fireEvent.click(submit);
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1)); expect(api.save.mock.calls[0][0]).toMatchObject({ expectedRevisionId: business.revisionId, acknowledgeReverification: true });
});
test("suspended profile is read only and review text is rendered as text", async () => {
  api.mine.mockResolvedValue({ ...business, status: "Suspended", latestReview: { status: "Suspended", reviewedAt: business.updatedAt, ownerMessage: "<img src=x onerror=alert(1)> נדרשת בדיקה" } });
  const { container } = render(<BusinessProfile />); expect(await screen.findByText(/<img src=x/)).toBeVisible();
  expect(container.querySelector("img")).toBeNull(); expect(screen.queryByLabelText(/^שם העסק/)).not.toBeInTheDocument();
});
test("conflict preserves unsaved fields until the owner explicitly adopts the refreshed version", async () => {
  api.mine.mockResolvedValue(business); api.save.mockRejectedValue(new MovelyApiError("private", { status: 409, errorCode: "BUSINESS_REVISION_CONFLICT" }));
  render(<BusinessProfile />); await screen.findByLabelText(/^שם העסק/);
  fireEvent.change(screen.getByLabelText(/^שם העסק/), { target: { value: "שינוי שטרם נשמר" } }); fireEvent.click(screen.getByRole("checkbox", { name: /אני מורשה/ })); fireEvent.click(screen.getByRole("button", { name: "שליחת הפרופיל לבדיקה" }));
  const refresh = await screen.findByRole("button", { name: "בדיקת המצב העדכני" });
  expect(screen.getByLabelText(/^שם העסק/)).toHaveValue("שינוי שטרם נשמר");
  api.mine.mockResolvedValue({ ...business, name: "גרסה בשרת" }); fireEvent.click(refresh);
  const adopt = await screen.findByRole("button", { name: "החלפת הטופס בגרסה העדכנית" });
  expect(screen.getByLabelText(/^שם העסק/)).toHaveValue("שינוי שטרם נשמר"); fireEvent.click(adopt);
  expect(screen.getByLabelText(/^שם העסק/)).toHaveValue("גרסה בשרת"); expect(api.save).toHaveBeenCalledTimes(1);
});
test("uncertain create blocks resending until an explicit GET establishes the current state", async () => {
  api.save.mockRejectedValue(new MovelyApiError("timeout", { status: 0, errorCode: "BUSINESS_WRITE_TIMEOUT" }));
  render(<BusinessProfile />); await fillNewProfile(); fireEvent.click(screen.getByRole("button", { name: "שליחת הפרופיל לבדיקה" }));
  await screen.findByText(/לא ידוע אם השמירה הושלמה/); expect(screen.getByRole("button", { name: "שליחת הפרופיל לבדיקה" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "בדיקת המצב העדכני" }));
  await screen.findByText(/לא נמצא פרופיל שמור/); expect(api.save).toHaveBeenCalledTimes(1); expect(api.mine).toHaveBeenCalledTimes(2);
});
test("duplicate submissions are locked and unmount aborts a pending owner write", async () => {
  let resolve!: (value: typeof business) => void; api.save.mockReturnValue(new Promise((done) => { resolve = done; }));
  const { unmount } = render(<BusinessProfile />); await fillNewProfile(); const form = screen.getByRole("button", { name: "שליחת הפרופיל לבדיקה" }).closest("form")!;
  fireEvent.submit(form); await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1)); fireEvent.submit(form); expect(api.save).toHaveBeenCalledTimes(1);
  const signal = api.save.mock.calls[0][2] as AbortSignal; unmount(); expect(signal.aborted).toBe(true); await act(async () => resolve(business)); expect(screen.queryByText(/הפרופיל נשלח/)).not.toBeInTheDocument();
});
test("service areas can be searched/removed and dictionary failure preserves existing selections", async () => {
  api.mine.mockResolvedValue(business); api.cities.mockRejectedValueOnce(new Error("offline")); render(<BusinessProfile />);
  const retry = await screen.findByRole("button", { name: "טעינת יישובים מחדש" }); expect(screen.getByRole("button", { name: "הסרת חיפה" })).toBeVisible(); fireEvent.click(retry);
  await screen.findByRole("option", { name: "תל אביב - יפו" }); fireEvent.change(screen.getByLabelText("חיפוש יישוב"), { target: { value: "תל" } });
  expect(screen.queryByRole("option", { name: "חיפה" })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "הסרת חיפה" })); expect(screen.getByText("נבחרו 0 מתוך 20 יישובים")).toBeVisible();
});
test("non-admin never loads private review data or list", async () => {
  render(<><AdminBusinessDetails businessId={business.id} /><AdminBusinesses search={{ page: 1, pageSize: 12 }} /></>);
  await screen.findAllByRole("heading", { name: "הגישה מיועדת למנהלי האתר" }); expect(api.admin).not.toHaveBeenCalled(); expect(api.list).not.toHaveBeenCalled();
});
async function prepareVerify() {
  api.user.mockResolvedValue({ ...customer, role: "Admin" }); render(<AdminBusinessDetails businessId={business.id} />);
  await screen.findByLabelText("החלטה"); fireEvent.change(screen.getByLabelText("החלטה"), { target: { value: "Verify" } });
  fireEvent.change(screen.getByLabelText(/^תיעוד פנימי/), { target: { value: "פרטי העסק והנציג נבדקו ידנית מול המקור הרשמי" } });
}
test("admin Verify requires two unchecked manual checks and separate explicit confirmation", async () => {
  await prepareVerify(); const first = screen.getByRole("checkbox", { name: /בדקתי את רישום/ }); const second = screen.getByRole("checkbox", { name: /בדקתי שהנציג/ });
  expect(first).not.toBeChecked(); expect(second).not.toBeChecked(); const review = screen.getByRole("button", { name: "בדיקת ההחלטה לפני שמירה" }); expect(review).toBeDisabled();
  fireEvent.click(first); expect(review).toBeDisabled(); fireEvent.click(second); fireEvent.click(review); expect(api.review).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "חזרה לעריכת ההחלטה" })); expect(api.review).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "בדיקת ההחלטה לפני שמירה" })); fireEvent.click(screen.getByRole("button", { name: "אישור ושמירת ההחלטה" }));
  await screen.findByText("החלטת הבדיקה נשמרה."); expect(api.review).toHaveBeenCalledTimes(1); expect(api.review.mock.calls[0][1]).toMatchObject({ expectedRevisionId: business.revisionId, decision: "Verify", registryChecked: true, representativeChecked: true });
  expect(screen.getByRole("option", { name: "השעיית העסק" })).toBeInTheDocument(); expect(screen.queryByRole("option", { name: "אישור העסק" })).not.toBeInTheDocument();
});
test("admin conflict requires refresh and fresh checks while preserving typed evidence", async () => {
  api.review.mockRejectedValue(new MovelyApiError("private", { status: 409, errorCode: "BUSINESS_REVISION_CONFLICT" })); await prepareVerify();
  fireEvent.click(screen.getByRole("checkbox", { name: /בדקתי את רישום/ })); fireEvent.click(screen.getByRole("checkbox", { name: /בדקתי שהנציג/ }));
  fireEvent.click(screen.getByRole("button", { name: "בדיקת ההחלטה לפני שמירה" })); fireEvent.click(screen.getByRole("button", { name: "אישור ושמירת ההחלטה" }));
  fireEvent.click(await screen.findByRole("button", { name: "בדיקת המצב העדכני" })); await screen.findByText(/הפרטים והמצב העדכניים נטענו/);
  expect(screen.getByLabelText(/^תיעוד פנימי/)).toHaveValue("פרטי העסק והנציג נבדקו ידנית מול המקור הרשמי"); expect(screen.getByLabelText("החלטה")).toHaveValue(""); expect(api.review).toHaveBeenCalledTimes(1);
});
test("admin tab returns preserve notes/checks only for the same admin and revision, with no private DOM while checking", async () => {
  await prepareVerify(); fireEvent.click(screen.getByRole("checkbox", { name: /בדקתי את רישום/ })); fireEvent.click(screen.getByRole("checkbox", { name: /בדקתי שהנציג/ }));
  fireEvent.click(screen.getByRole("button", { name: "בדיקת ההחלטה לפני שמירה" }));
  let resolve!: (value: typeof customer) => void; api.user.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  fireEvent.blur(window); fireEvent.focus(window);
  expect(screen.queryByText(business.registeredAddress!)).not.toBeInTheDocument(); expect(screen.queryByLabelText(/^תיעוד פנימי/)).not.toBeInTheDocument();
  await act(async () => resolve({ ...customer, role: "Admin" }));
  expect(await screen.findByLabelText(/^תיעוד פנימי/)).toHaveValue("פרטי העסק והנציג נבדקו ידנית מול המקור הרשמי");
  expect(screen.getByRole("checkbox", { name: /בדקתי את רישום/ })).toBeChecked(); expect(screen.getByRole("checkbox", { name: /בדקתי שהנציג/ })).toBeChecked();
  expect(screen.queryByRole("button", { name: "אישור ושמירת ההחלטה" })).not.toBeInTheDocument();
  api.admin.mockResolvedValue({ ...adminBusiness, revisionId: "dddddddd-1111-4111-8111-111111111111", hasMoreReviews: true }); fireEvent.blur(window); fireEvent.focus(window);
  expect(await screen.findByLabelText(/^תיעוד פנימי/)).toHaveValue("פרטי העסק והנציג נבדקו ידנית מול המקור הרשמי"); expect(screen.getByLabelText("החלטה")).toHaveValue("");
  expect(screen.getByText(/פרטי העסק השתנו/)).toBeVisible(); expect(screen.getByText(/מוצגות 100 הבדיקות האחרונות/)).toBeVisible();
  fireEvent.change(screen.getByLabelText("החלטה"), { target: { value: "Verify" } }); expect(screen.getByRole("checkbox", { name: /בדקתי את רישום/ })).not.toBeChecked();
  api.user.mockResolvedValue({ ...customer, id: "other-admin", role: "Admin" }); fireEvent.blur(window); fireEvent.focus(window);
  expect(await screen.findByLabelText(/^תיעוד פנימי/)).toHaveValue(""); expect(api.review).not.toHaveBeenCalled();
});
test("admin logout clears the draft even if the same admin signs in again", async () => {
  await prepareVerify(); api.user.mockResolvedValue(null); fireEvent.blur(window); fireEvent.focus(window);
  await screen.findByRole("heading", { name: "הגישה מיועדת למנהלי האתר" });
  api.user.mockResolvedValue({ ...customer, role: "Admin" }); fireEvent.blur(window); fireEvent.focus(window);
  expect(await screen.findByLabelText(/^תיעוד פנימי/)).toHaveValue("");
});
test("admin mutation authorization loss removes private owner details and notes", async () => {
  api.review.mockRejectedValue(new MovelyApiError("private", { status: 403, errorCode: "FORBIDDEN" })); await prepareVerify();
  fireEvent.click(screen.getByRole("checkbox", { name: /בדקתי את רישום/ })); fireEvent.click(screen.getByRole("checkbox", { name: /בדקתי שהנציג/ }));
  fireEvent.click(screen.getByRole("button", { name: "בדיקת ההחלטה לפני שמירה" })); fireEvent.click(screen.getByRole("button", { name: "אישור ושמירת ההחלטה" }));
  await screen.findByRole("link", { name: "כניסה לחשבון" }); expect(screen.queryByText(business.registeredAddress!)).not.toBeInTheDocument(); expect(screen.queryByLabelText(/^תיעוד פנימי/)).not.toBeInTheDocument();
});
test("admin read timeout aborts and late private data cannot replace a failed request", async () => {
  vi.useFakeTimers(); api.user.mockResolvedValue({ ...customer, role: "Admin" }); let resolve!: (value: typeof adminBusiness) => void; api.admin.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<AdminBusinessDetails businessId={business.id} />); await act(async () => {}); const signal = api.admin.mock.calls[0][1] as AbortSignal;
  await act(async () => vi.advanceTimersByTime(10_000)); expect(signal.aborted).toBe(true); expect(screen.getByRole("alert")).toHaveTextContent("זמן רב מדי");
  await act(async () => resolve(adminBusiness)); expect(screen.queryByLabelText("החלטה")).not.toBeInTheDocument();
});
