import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import AccountRequests from "./AccountRequests";
import { MovelyApiError, type CurrentUser, type MoveRequestSummaryResponse } from "@/lib/movely-api";
const mocks = vi.hoisted(() => ({ me: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/movely-api", async () => ({ ...await vi.importActual("@/lib/movely-api"), getCurrentUser: mocks.me, getMyMoveRequests: mocks.list }));
const user = { id: "owner", firstName: "נועה", role: "Customer" } as CurrentUser;
const draftId = "018c7b81-7185-4b14-b37b-1d1bfa012345";
function request(status: MoveRequestSummaryResponse["status"], id = draftId) {
  return { id, status, requestType: "ApartmentMove", updatedAt: "2026-10-29T10:00:00Z" } as MoveRequestSummaryResponse;
}
beforeEach(() => { vi.resetAllMocks(); mocks.me.mockResolvedValue(user); mocks.list.mockResolvedValue([]); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

test("list failure is recoverable and never presented as empty", async () => {
  mocks.list.mockRejectedValueOnce(new TypeError("offline"));
  render(<AccountRequests />);
  expect(await screen.findByRole("alert")).toHaveTextContent("לא הצלחנו לטעון");
  expect(screen.queryByText("עדיין אין בקשות")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ניסיון נוסף" }));
  expect(await screen.findByText("עדיין אין בקשות")).toBeVisible();
  expect(mocks.list).toHaveBeenCalledTimes(2);
});
test.each([null, { ...user, role: "Mover" }])("signed-out or non-customer never fetches owner list", async (current) => {
  mocks.me.mockResolvedValue(current); render(<AccountRequests />);
  expect(await screen.findByRole("link", { name: current ? "מעבר לחשבון המתאים" : "התחברות" })).toHaveAttribute("href", "/auth");
  expect(mocks.list).not.toHaveBeenCalled();
});
test("owner links open real details and resume exact draft; filters reset", async () => {
  const activeId = "018c7b81-7185-4b14-b37b-1d1bfa012346";
  mocks.list.mockResolvedValue([request("Draft"), request("Active", activeId)]); render(<AccountRequests />);
  expect(await screen.findByRole("link", { name: "המשך הטיוטה" })).toHaveAttribute("href", `/request/new?requestId=${draftId}`);
  expect(screen.getAllByRole("link", { name: "צפייה בבקשה" }).map((link) => link.getAttribute("href"))).toEqual([`/account/requests/${draftId}`, `/account/requests/${activeId}`]);
  fireEvent.click(screen.getByRole("button", { name: "בקשות פעילות" }));
  expect(screen.queryByRole("link", { name: "המשך הטיוטה" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "צפייה בבקשה" })).toHaveAttribute("href", `/account/requests/${activeId}`);
  fireEvent.click(screen.getByRole("button", { name: "בקשות שהסתיימו" }));
  expect(screen.getByText("אין בקשות בקטגוריה הזאת")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "הצגת כל הבקשות" }));
  expect(screen.getAllByRole("link", { name: "צפייה בבקשה" })).toHaveLength(2);
});
test("expired session offers login rather than empty list", async () => {
  mocks.list.mockRejectedValue(new MovelyApiError("expired", { status: 401, errorCode: "HTTP_ERROR" })); render(<AccountRequests />);
  expect(await screen.findByRole("link", { name: "התחברות" })).toBeVisible();
  expect(screen.queryByText("עדיין אין בקשות")).not.toBeInTheDocument();
});
test("timeout aborts; late private data cannot replace retry result", async () => {
  vi.useFakeTimers();
  let finish!: (value: MoveRequestSummaryResponse[]) => void;
  mocks.list.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; })); render(<AccountRequests />);
  await act(async () => {});
  const signal = mocks.list.mock.calls[0][0] as AbortSignal;
  await act(async () => vi.advanceTimersByTime(10_000));
  expect(signal.aborted).toBe(true); expect(screen.getByRole("alert")).toBeVisible();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "ניסיון נוסף" })));
  expect(screen.getByText("עדיין אין בקשות")).toBeVisible();
  await act(async () => finish([request("Active")]));
  expect(screen.queryByRole("link", { name: "צפייה בבקשה" })).not.toBeInTheDocument();
});
test("unmount cancels both reads through shared signal", async () => {
  mocks.list.mockReturnValue(new Promise(() => {})); const rendered = render(<AccountRequests />);
  await waitFor(() => expect(mocks.list).toHaveBeenCalledOnce());
  const signal = mocks.list.mock.calls[0][0] as AbortSignal;
  expect(mocks.me.mock.calls[0][0]).toBe(signal); rendered.unmount(); expect(signal.aborted).toBe(true);
});

test("returning to the tab hides the previous owner's list until session revalidation", async () => {
  mocks.list.mockResolvedValue([request("Draft")]);
  render(<AccountRequests />);
  expect(await screen.findByRole("link", { name: "המשך הטיוטה" })).toBeVisible();
  let finish!: (value: CurrentUser | null) => void;
  mocks.me.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  fireEvent.blur(window);
  fireEvent.focus(window);
  expect(screen.queryByRole("link", { name: "המשך הטיוטה" })).not.toBeInTheDocument();
  expect(screen.queryByText(/ברוכים השבים/)).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("טוענים");
  fireEvent(document, new Event("visibilitychange"));
  expect(mocks.me).toHaveBeenCalledTimes(2);
  await act(async () => finish(null));
  expect(await screen.findByRole("link", { name: "התחברות" })).toBeVisible();
  expect(mocks.list).toHaveBeenCalledTimes(1);
});

test("foreground refresh aborts an old read and never restores its private rows", async () => {
  let finish!: (value: MoveRequestSummaryResponse[]) => void;
  mocks.list.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  render(<AccountRequests />);
  await waitFor(() => expect(mocks.list).toHaveBeenCalledOnce());
  const previousSignal = mocks.list.mock.calls[0][0] as AbortSignal;
  mocks.me.mockResolvedValue({ ...user, id: "new-owner", firstName: "דנה" });
  fireEvent.blur(window);
  fireEvent.focus(window);
  expect(previousSignal.aborted).toBe(true);
  expect(await screen.findByText("עדיין אין בקשות")).toBeVisible();
  expect(screen.getByText(/ברוכים השבים, דנה/)).toBeVisible();
  await act(async () => finish([request("Active")]));
  expect(screen.queryByRole("link", { name: "צפייה בבקשה" })).not.toBeInTheDocument();
});

test("BFcache restore rechecks the list but ordinary pageshow and unmounted events do not", async () => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  mocks.list.mockResolvedValueOnce([request("Draft")]);
  const rendered = render(<AccountRequests />);
  await screen.findByRole("link", { name: "המשך הטיוטה" });
  fireEvent(window, new Event("pageshow"));
  expect(mocks.me).toHaveBeenCalledTimes(1);
  const restored = new Event("pageshow");
  Object.defineProperty(restored, "persisted", { value: true });
  fireEvent(window, restored);
  expect(screen.queryByRole("link", { name: "המשך הטיוטה" })).not.toBeInTheDocument();
  expect(await screen.findByText("עדיין אין בקשות")).toBeVisible();
  expect(mocks.me).toHaveBeenCalledTimes(2);
  rendered.unmount();
  fireEvent.blur(window);
  fireEvent.focus(window);
  fireEvent(window, restored);
  expect(mocks.me).toHaveBeenCalledTimes(2);
});
