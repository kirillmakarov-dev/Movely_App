import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import MarketplaceBrowser from "./MarketplaceBrowser";
import MarketplaceDetails from "./MarketplaceDetails";
import { marketplaceDate } from "./RequestCard";
import { detailFixture, verifiedMover } from "./marketplace.test-fixtures";
import { MovelyApiError, type CurrentUser } from "@/lib/movely-api";
import { parseMarketplaceFilters, type MarketplaceDetails as Details, type MarketplacePage } from "@/lib/marketplace-api";
const api = vi.hoisted(() => ({ user: vi.fn(), cities: vi.fn(), list: vi.fn(), detail: vi.fn() }));
vi.mock("@/lib/movely-api", async () => ({ ...await vi.importActual("@/lib/movely-api"), getCurrentUser: api.user, getLocalities: api.cities }));
vi.mock("@/lib/marketplace-api", async () => ({ ...await vi.importActual("@/lib/marketplace-api"), getMarketplaceRequests: api.list, getMarketplaceRequest: api.detail }));
const defaults = parseMarketplaceFilters({});
const page = (overrides: Partial<MarketplacePage> = {}): MarketplacePage => ({ items: [detailFixture], page: 1, pageSize: 12, totalCount: 25, ...overrides });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  vi.resetAllMocks();
  api.user.mockResolvedValue(verifiedMover);
  api.cities.mockResolvedValue([{ code: "4000", name: "חיפה" }, { code: "5000", name: "תל אביב - יפו" }]);
  api.list.mockImplementation(async (filters) => page({ page: filters.page, pageSize: filters.pageSize }));
  api.detail.mockResolvedValue(detailFixture);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

test("date-only values retain their day while publication timestamps use the Israel calendar", () => {
  expect(marketplaceDate("2026-07-10")).toBe("10 ביולי 2026");
  expect(marketplaceDate("2026-07-10T21:00:00Z")).toBe("11 ביולי 2026");
});

test.each([
  [null, "התחברו כדי לצפות בבקשות"],
  [{ ...verifiedMover, role: "Customer", businessId: null }, "עדיין אין עסק משויך לחשבון"],
  [{ ...verifiedMover, role: "Customer", businessStatus: "PendingVerification" }, "העסק עדיין ממתין לאימות"],
  [{ ...verifiedMover, role: "Admin" }, "הבקשות מיועדות למובילים עם עסק מאומת"],
  [{ ...verifiedMover, businessId: null }, "עדיין אין עסק משויך לחשבון"],
  [{ ...verifiedMover, businessStatus: "PendingVerification" }, "העסק עדיין ממתין לאימות"],
  [{ ...verifiedMover, businessStatus: "Suspended" }, "הגישה של העסק מוגבלת כרגע"],
  [{ ...verifiedMover, businessStatus: "Rejected" }, "העסק אינו מאושר לצפייה בבקשות"],
  [{ ...verifiedMover, hasCurrentPolicyAcceptance: false }, "נדרש אישור התנאים המעודכנים"],
  [{ ...verifiedMover, phoneVerified: false }, "נדרש אימות טלפון"],
] as const)("ineligible session never loads marketplace data: %j", async (user, title) => {
  api.user.mockResolvedValue(user);
  render(<MarketplaceBrowser />);
  expect(await screen.findByRole("heading", { name: title })).toBeVisible();
  expect(api.list).not.toHaveBeenCalled(); expect(api.cities).not.toHaveBeenCalled();
  if (user?.role === "Customer") expect(screen.getByRole("link", { name: "הבקשות שלי" })).toHaveAttribute("href", "/account/requests");
});

test("a customer with a verified business can view the marketplace without changing primary role", async () => {
  const customer = { ...verifiedMover, role: "Customer" as const };
  api.user.mockResolvedValue(customer);
  render(<MarketplaceBrowser />);
  expect(await screen.findByRole("link", { name: "צפייה בבקשה" })).toBeVisible();
  expect(customer.role).toBe("Customer");
});

test("no catalogue is fetched before session checking completes", async () => {
  const check = deferred<CurrentUser | null>(); api.user.mockReturnValue(check.promise);
  render(<MarketplaceBrowser />);
  expect(screen.getByRole("status")).toHaveTextContent("בודקים את הגישה"); expect(api.list).not.toHaveBeenCalled();
  await act(async () => check.resolve(verifiedMover));
  expect(await screen.findByRole("link", { name: "צפייה בבקשה" })).toBeVisible();
});

test("the real GET filter form preserves submitted URL values, pagination and a safe detail return path", async () => {
  const filters = parseMarketplaceFilters({ pickupCityCode: "4000", requestType: "ApartmentMove", moveDate: "2026-12-15", budgetBand: "From2000To3000", sort: "MoveDate", page: "2" });
  const { rerender } = render(<MarketplaceBrowser filters={filters} basePath="/mover/requests" />);
  const viewLink = await screen.findByRole("link", { name: "צפייה בבקשה" });
  expect(api.list).toHaveBeenCalledWith(filters, expect.any(AbortSignal));
  expect(screen.getByLabelText("עיר איסוף")).toHaveValue("4000");
  expect(screen.getByLabelText("תאריך ההובלה")).toHaveValue("2026-12-15");
  expect(screen.getByLabelText("מיון")).toHaveValue("MoveDate");
  expect(viewLink.getAttribute("href")).toContain("from=mover");
  expect(viewLink.getAttribute("href")).toContain("page=2");
  expect(screen.getByRole("link", { name: "העמוד הקודם" }).getAttribute("href")).toContain("page=1");
  expect(screen.getByRole("link", { name: "העמוד הבא" }).getAttribute("href")).toContain("page=3");
  const form = screen.getByRole("form", { name: "סינון בקשות הובלה" }) as HTMLFormElement;
  expect(form).toHaveAttribute("method", "get"); expect(form).toHaveAttribute("action", "/mover/requests");
  fireEvent.change(screen.getByLabelText("עיר יעד"), { target: { value: "5000" } });
  fireEvent.change(screen.getByLabelText("סוג הובלה"), { target: { value: "SmallMove" } });
  expect(api.list).toHaveBeenCalledTimes(1);
  const submitted = new FormData(form);
  expect(submitted.get("destinationCityCode")).toBe("5000"); expect(submitted.get("page")).toBe("1");
  rerender(<MarketplaceBrowser filters={defaults} basePath="/mover/requests" />);
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText("עיר איסוף")).toHaveValue("");
  rerender(<MarketplaceBrowser filters={filters} basePath="/mover/requests" />);
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(3));
  expect(screen.getByLabelText("עיר איסוף")).toHaveValue("4000");
});

test.each([[{}, "אין כרגע בקשות זמינות"], [{ requestType: "SmallMove" }, "לא נמצאו בקשות למסננים האלה"]])("empty results have no fake fallback: %j", async (search, heading) => {
  api.list.mockResolvedValue(page({ items: [], totalCount: 0 }));
  render(<MarketplaceBrowser filters={parseMarketplaceFilters(search)} />);
  expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
  expect(screen.queryByRole("link", { name: "צפייה בבקשה" })).not.toBeInTheDocument();
});

test("an emptied later page links to the first filtered page without claiming the whole market is empty", async () => {
  api.list.mockResolvedValue(page({ items: [], page: 4, totalCount: 2 }));
  render(<MarketplaceBrowser filters={parseMarketplaceFilters({ page: "4", pickupCityCode: "4000" })} />);
  expect(await screen.findByRole("heading", { name: "אין בקשות בעמוד הזה" })).toBeVisible();
  expect(screen.getByRole("link", { name: "חזרה לעמוד הראשון" }).getAttribute("href")).toContain("pickupCityCode=4000&sort=Newest&page=1");
});

test.each([[1, 1], [2, 13]])("concurrent publication count stays consistent with the received page %i", async (pageNumber, effectiveCount) => {
  api.list.mockResolvedValue(page({ page: pageNumber, totalCount: 0 }));
  render(<MarketplaceBrowser filters={parseMarketplaceFilters({ page: String(pageNumber) })} />);
  expect(await screen.findByRole("link", { name: "צפייה בבקשה" })).toBeVisible();
  expect(screen.getByText(`${effectiveCount} בקשות מתאימות · עמוד ${pageNumber}`)).toBeVisible();
  expect(screen.queryByRole("link", { name: "העמוד הבא" })).not.toBeInTheDocument();
});

test.each([
  ["cards", "focus"], ["cards", "visibility"],
  ["details", "focus"], ["details", "visibility"],
])("returning to %s through %s immediately clears private data and rechecks logout/login once per foreground edge", async (surface, returnEvent) => {
  let visibility: DocumentVisibilityState = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const markerRole = surface === "cards" ? "link" : "heading";
  const markerName = surface === "cards" ? "צפייה בבקשה" : "ספה";
  const { unmount } = render(surface === "cards" ? <MarketplaceBrowser /> : <MarketplaceDetails requestId={detailFixture.id} />);
  await screen.findByRole(markerRole, { name: markerName });
  const recheck = deferred<CurrentUser | null>();
  api.user.mockReturnValueOnce(recheck.promise);

  if (returnEvent === "visibility") {
    visibility = "hidden";
    fireEvent(document, new Event("visibilitychange"));
    fireEvent.focus(window);
    expect(api.user).toHaveBeenCalledTimes(1);
    visibility = "visible";
    fireEvent(document, new Event("visibilitychange"));
  } else {
    fireEvent.blur(window);
    fireEvent.focus(window);
  }
  expect(screen.queryByRole(markerRole, { name: markerName })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("בודקים את הגישה");
  fireEvent.focus(window);
  fireEvent(document, new Event("visibilitychange"));
  expect(api.user).toHaveBeenCalledTimes(2);
  await act(async () => recheck.resolve(null));
  expect(await screen.findByRole("heading", { name: "התחברו כדי לצפות בבקשות" })).toBeVisible();
  expect(surface === "cards" ? api.list : api.detail).toHaveBeenCalledTimes(1);

  // A later return must not be suppressed by the earlier burst's deduplication.
  api.user.mockResolvedValue(verifiedMover);
  fireEvent.blur(window);
  fireEvent.focus(window);
  expect(await screen.findByRole(markerRole, { name: markerName })).toBeVisible();
  expect(api.user).toHaveBeenCalledTimes(3);
  expect(surface === "cards" ? api.list : api.detail).toHaveBeenCalledTimes(2);
  unmount();
  fireEvent.blur(window);
  fireEvent.focus(window);
  fireEvent(document, new Event("visibilitychange"));
  expect(api.user).toHaveBeenCalledTimes(3);
});

test("returning from browser history rechecks access and removes restored results after logout", async () => {
  render(<MarketplaceBrowser />);
  await screen.findByRole("link", { name: "צפייה בבקשה" });
  api.user.mockResolvedValue(null);
  fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
  expect(screen.queryByRole("link", { name: "צפייה בבקשה" })).not.toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "התחברו כדי לצפות בבקשות" })).toBeVisible();
});

test.each([401, 403, 429, 503])("list HTTP %s is a safe error and can retry", async (status) => {
  api.list.mockRejectedValueOnce(new MovelyApiError("private provider message", { status, errorCode: "HTTP_ERROR" }));
  render(<MarketplaceBrowser />);
  expect(await screen.findByRole("alert")).not.toHaveTextContent("private provider message");
  expect(screen.queryByRole("link", { name: "צפייה בבקשה" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ניסיון נוסף" }));
  expect(await screen.findByRole("link", { name: "צפייה בבקשה" })).toBeVisible();
});

test("a later access denial clears previously rendered cards", async () => {
  const { rerender } = render(<MarketplaceBrowser />);
  await screen.findByRole("link", { name: "צפייה בבקשה" });
  api.list.mockRejectedValue(new MovelyApiError("private", { status: 403, errorCode: "POLICY_ACCEPTANCE_REQUIRED" }));
  rerender(<MarketplaceBrowser filters={parseMarketplaceFilters({ page: "2" })} />);
  expect(screen.queryByRole("link", { name: "צפייה בבקשה" })).not.toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "נדרש אישור התנאים המעודכנים" })).toBeVisible();
  expect(screen.getByRole("link", { name: "כניסה לחשבון" })).toHaveAttribute("href", "/auth");
});

test("ten-second GET timeout aborts and late results cannot overwrite a retry", async () => {
  vi.useFakeTimers();
  const slow = deferred<MarketplacePage>(); api.list.mockReturnValueOnce(slow.promise);
  render(<MarketplaceBrowser />);
  await act(async () => {});
  const signal = api.list.mock.calls[0][1] as AbortSignal;
  await act(async () => vi.advanceTimersByTime(10_000));
  expect(signal.aborted).toBe(true);
  expect(screen.getByRole("heading", { name: "הטעינה נמשכת זמן רב מדי" })).toBeVisible();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "ניסיון נוסף" })));
  expect(screen.getByRole("link", { name: "צפייה בבקשה" })).toBeVisible();
  await act(async () => slow.resolve(page({ items: [], totalCount: 0 })));
  expect(screen.getByRole("link", { name: "צפייה בבקשה" })).toBeVisible();
});

test("a stale search and unmount abort pending requests", async () => {
  const slow = deferred<MarketplacePage>(); api.list.mockReturnValueOnce(slow.promise);
  const { rerender, unmount } = render(<MarketplaceBrowser />);
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));
  const oldSignal = api.list.mock.calls[0][1] as AbortSignal;
  rerender(<MarketplaceBrowser filters={parseMarketplaceFilters({ page: "2" })} />);
  await screen.findByRole("link", { name: "צפייה בבקשה" });
  expect(oldSignal.aborted).toBe(true);
  await act(async () => slow.resolve(page({ items: [], totalCount: 0 })));
  expect(screen.getByText(/25 בקשות מתאימות · עמוד 2/)).toBeVisible();
  const newSignal = api.list.mock.calls[1][1] as AbortSignal;
  unmount(); expect(newSignal.aborted).toBe(true);
});

test("dictionary failure leaves working noncity filters and can retry", async () => {
  api.cities.mockRejectedValueOnce(new Error("offline"));
  render(<MarketplaceBrowser />);
  await screen.findByRole("button", { name: "טעינת היישובים מחדש" });
  expect(screen.getByLabelText("סוג הובלה")).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "טעינת היישובים מחדש" }));
  await waitFor(() => expect(screen.getAllByRole("option", { name: "חיפה" })).toHaveLength(2));
});

test("detail shows only safe enum labels, no purchase or contact actions, and preserves the list return URL", async () => {
  api.detail.mockResolvedValue({ ...detailFixture, pickupCity: null, name: "untrusted name", items: [{ ...detailFixture.items[0], name: "untrusted custom item" }] });
  render(<MarketplaceDetails requestId={detailFixture.id} fromMover filters={parseMarketplaceFilters({ page: "2", pickupCityCode: "4000" })} />);
  expect(await screen.findByRole("heading", { name: "ספה" })).toBeVisible();
  expect(screen.getByText("יישוב לא מזוהה")).toBeVisible();
  expect(screen.getByText("קומת קרקע")).toBeVisible();
  expect(screen.getByText("0 מטרים")).toBeVisible();
  expect(screen.getByText("15 בדצמבר 2026")).toBeVisible();
  expect(screen.getByText("פירוק רהיטים")).toBeVisible();
  expect(screen.getByRole("heading", { name: "פרטי הקשר אינם זמינים" })).toBeVisible();
  expect(screen.queryByText(/untrusted/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /רכיש|קנייה|התקשר/ })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "חזרה לבקשות" }).getAttribute("href")).toContain("/mover/requests?pickupCityCode=4000");
  expect(api.detail).toHaveBeenCalledWith(detailFixture.id, expect.any(AbortSignal));
});

test("detail 404 is not an owner fallback; changing ID hides prior content", async () => {
  const pending = deferred<Details>();
  const { rerender } = render(<MarketplaceDetails requestId={detailFixture.id} />);
  await screen.findByRole("heading", { name: "ספה" });
  api.detail.mockReturnValueOnce(pending.promise);
  rerender(<MarketplaceDetails requestId="bbbbbbbb-1111-4111-8111-111111111111" />);
  expect(screen.queryByRole("heading", { name: "ספה" })).not.toBeInTheDocument();
  api.detail.mockRejectedValueOnce(new MovelyApiError("private", { status: 404, errorCode: "NOT_FOUND" }));
  rerender(<MarketplaceDetails requestId="cccccccc-1111-4111-8111-111111111111" />);
  expect(await screen.findByRole("heading", { name: "הבקשה אינה זמינה" })).toBeVisible();
  await act(async () => pending.resolve(detailFixture));
  expect(screen.queryByRole("heading", { name: "ספה" })).not.toBeInTheDocument();
});
