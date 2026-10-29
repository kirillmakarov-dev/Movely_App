import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import CustomerRequestFlow from "./CustomerRequestFlow";
import type { Locality } from "@/lib/movely-api";

const api = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getMyMoveRequests: vi.fn(), getAuthCapabilities: vi.fn(), getLocalities: vi.fn() }));
vi.mock("@/lib/movely-api", async () => ({ ...await vi.importActual("@/lib/movely-api"), ...api }));

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  api.getCurrentUser.mockResolvedValue(null);
  api.getMyMoveRequests.mockResolvedValue([]);
  api.getAuthCapabilities.mockResolvedValue({ policyAcceptanceAvailable: false, googleSignInAvailable: false, googleClientId: null, phoneVerificationAvailable: false });
  api.getLocalities.mockResolvedValue([{ code: "4000", name: "חיפה" }, { code: "5000", name: "תל אביב - יפו" }]);
});
afterEach(() => { cleanup(); sessionStorage.clear(); });

async function openRoute() {
  await waitFor(() => expect(screen.getByRole("button", { name: /^המשך$/ })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: /הובלת דירה הובלה מלאה/ }));
  fireEvent.click(screen.getByRole("button", { name: /^המשך$/ }));
  return screen.findByRole("combobox", { name: "איסוף עיר" });
}

test("the real wizard mounts one shared city list only on the route step and never overwrites user input", async () => {
  let resolve!: (value: Locality[]) => void;
  api.getLocalities.mockReturnValue(new Promise<Locality[]>((done) => { resolve = done; }));
  const { container } = render(<CustomerRequestFlow />);
  await waitFor(() => expect(screen.getByRole("button", { name: /^המשך$/ })).toBeEnabled());
  expect(api.getLocalities).not.toHaveBeenCalled();
  const pickup = await openRoute();
  const destination = screen.getByRole("combobox", { name: "יעד עיר" });
  expect(container.querySelectorAll("datalist")).toHaveLength(1);
  expect(pickup.getAttribute("list")).toBe(destination.getAttribute("list"));
  expect(pickup).toHaveAttribute("id", "move-field-pickup.city");
  expect(pickup).toHaveAttribute("aria-required", "true");
  fireEvent.change(pickup, { target: { value: "Legacy custom locality" } });
  fireEvent.change(destination, { target: { value: "ירושלים" } });
  await act(async () => resolve([{ code: "4000", name: "חיפה" }, { code: "5000", name: "תל אביב - יפו" }]));
  expect(container.querySelectorAll("datalist option")).toHaveLength(2);
  expect(pickup).toHaveValue("Legacy custom locality");
  expect(destination).toHaveValue("ירושלים");
  expect(api.getLocalities).toHaveBeenCalledTimes(1);
  fireEvent.change(pickup, { target: { value: "" } });
  fireEvent.click(screen.getByText("מעבר לשלב אחר", { exact: true }));
  fireEvent.click(screen.getByRole("button", { name: /אימות ופרסום/ }));
  fireEvent.click(screen.getByRole("button", { name: /פרסום הבקשה/ }));
  const invalidPickup = await screen.findByRole("combobox", { name: "איסוף עיר" });
  await waitFor(() => expect(invalidPickup).toHaveFocus());
  expect(invalidPickup).toHaveAttribute("aria-invalid", "true");
  expect(invalidPickup.getAttribute("aria-describedby")).toContain("move-error-pickup.city");
  expect(invalidPickup.getAttribute("aria-describedby")).toContain(`${invalidPickup.getAttribute("list")}-hint`);
});

test("suggestion failure does not block a manually completed route and leaving the step aborts the next request", async () => {
  api.getLocalities.mockRejectedValueOnce(new Error("server offline"));
  render(<CustomerRequestFlow />);
  await openRoute();
  await screen.findByRole("button", { name: "טעינת ההצעות מחדש" });
  for (const [label, value] of [
    ["איסוף עיר", "Old name"], ["איסוף כתובת מדויקת", "רחוב א 1"],
    ["יעד עיר", "Another old name"], ["יעד כתובת מדויקת", "רחוב ב 2"],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  api.getLocalities.mockReturnValueOnce(new Promise<Locality[]>(() => {}));
  fireEvent.click(screen.getByRole("button", { name: "טעינת ההצעות מחדש" }));
  const signal = api.getLocalities.mock.calls[1][0] as AbortSignal;
  fireEvent.click(screen.getByRole("button", { name: /^המשך$/ }));
  expect(await screen.findByRole("heading", { name: /תכולת הדירה/ })).toBeVisible();
  expect(signal.aborted).toBe(true);
  expect(screen.queryByRole("combobox", { name: "איסוף עיר" })).not.toBeInTheDocument();
});
