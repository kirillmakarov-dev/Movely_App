import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import CurrentPolicyAcceptance from "./CurrentPolicyAcceptance";
import { MovelyApiError } from "@/lib/movely-api";
import { LEGAL_DRAFT_VERSION } from "@/lib/legal-content";

const api = vi.hoisted(() => ({ capabilities: vi.fn(), accept: vi.fn() }));
vi.mock("@/lib/movely-api", async () => ({ ...await vi.importActual("@/lib/movely-api"), getAuthCapabilities: api.capabilities, acceptPolicies: api.accept }));
const available = { policyAcceptanceAvailable: true, googleSignInAvailable: false, googleClientId: null, phoneVerificationAvailable: false };
beforeEach(() => { vi.resetAllMocks(); api.capabilities.mockResolvedValue(available); api.accept.mockResolvedValue(undefined); });
afterEach(cleanup);
async function chooseBoth() { for (const checkbox of await screen.findAllByRole("checkbox")) fireEvent.click(checkbox); }

test("existing account can accept without Google but only after both initially unchecked choices", async () => {
  const accepted = vi.fn();
  render(<CurrentPolicyAcceptance onAccepted={accepted} />);
  const choices = await screen.findAllByRole("checkbox");
  choices.forEach((choice) => expect(choice).not.toBeChecked());
  expect(screen.getByRole("link", { name: "תנאי השימוש" })).toHaveAttribute("target", "_blank");
  expect(screen.getByRole("link", { name: "הודעת הפרטיות" })).toHaveAttribute("href", "/privacy");
  const submit = screen.getByRole("button", { name: "אישור והמשך" });
  expect(submit).toBeDisabled();
  fireEvent.submit(screen.getByRole("form"));
  expect(api.accept).not.toHaveBeenCalled();
  fireEvent.click(choices[0]);
  expect(submit).toBeDisabled();
  fireEvent.click(choices[1]);
  fireEvent.click(submit);
  await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
  expect(api.accept).toHaveBeenCalledExactlyOnceWith({ adultConfirmed: true, acceptTerms: true, termsVersion: LEGAL_DRAFT_VERSION, privacyVersion: LEGAL_DRAFT_VERSION });
});

test("unavailable policy capabilities collect no consent and can be checked again", async () => {
  api.capabilities.mockResolvedValueOnce({ ...available, policyAcceptanceAvailable: false });
  render(<CurrentPolicyAcceptance onAccepted={vi.fn()} />);
  expect(await screen.findByText(/אישור התנאים המעודכנים עדיין אינו זמין/)).toBeVisible();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "בדיקה נוספת" }));
  expect(await screen.findAllByRole("checkbox")).toHaveLength(2);
  expect(api.accept).not.toHaveBeenCalled();
});

test("capability network failure retries without offering premature acceptance", async () => {
  api.capabilities.mockRejectedValueOnce(new TypeError("offline"));
  render(<CurrentPolicyAcceptance onAccepted={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "בדיקה נוספת" }));
  expect(await screen.findAllByRole("checkbox")).toHaveLength(2);
  expect(api.accept).not.toHaveBeenCalled();
});

test("network failure preserves choices and only an explicit retry sends another mutation", async () => {
  api.accept.mockRejectedValueOnce(new TypeError("private transport details"));
  const accepted = vi.fn();
  render(<CurrentPolicyAcceptance onAccepted={accepted} />);
  await chooseBoth();
  fireEvent.click(screen.getByRole("button", { name: "אישור והמשך" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("הבחירות נשמרו");
  expect(screen.getByRole("alert")).not.toHaveTextContent("private transport");
  screen.getAllByRole("checkbox").forEach((choice) => expect(choice).toBeChecked());
  expect(accepted).not.toHaveBeenCalled();
  expect(api.accept).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "אישור והמשך" }));
  await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
  expect(api.accept).toHaveBeenCalledTimes(2);
});

test("duplicate submissions are ignored and parent busy is released before acceptance callback", async () => {
  let finish!: () => void;
  api.accept.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  const busy = vi.fn();
  const accepted = vi.fn(() => expect(busy).toHaveBeenLastCalledWith(false));
  render(<CurrentPolicyAcceptance onAccepted={accepted} onBusyChange={busy} />);
  await chooseBoth();
  act(() => { fireEvent.submit(screen.getByRole("form")); fireEvent.submit(screen.getByRole("form")); });
  expect(api.accept).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "אישור והמשך" })).toBeDisabled();
  screen.getAllByRole("checkbox").forEach((choice) => expect(choice).toBeDisabled());
  await act(async () => finish());
  expect(busy.mock.calls).toEqual([[true], [false]]);
  expect(accepted).toHaveBeenCalledOnce();
});

test.each([401, 403])("HTTP %s invalidates the session without claiming acceptance", async (status) => {
  api.accept.mockRejectedValue(new MovelyApiError("private", { status, errorCode: "SESSION_INVALID" }));
  const invalid = vi.fn(); const accepted = vi.fn();
  render(<CurrentPolicyAcceptance onAccepted={accepted} onSessionInvalid={invalid} />);
  await chooseBoth();
  fireEvent.click(screen.getByRole("button", { name: "אישור והמשך" }));
  await waitFor(() => expect(invalid).toHaveBeenCalledOnce());
  expect(accepted).not.toHaveBeenCalled();
});

test("unmount ignores late completion and never calls parent callbacks", async () => {
  let finish!: () => void;
  api.accept.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  const accepted = vi.fn(); const busy = vi.fn();
  const { unmount } = render(<CurrentPolicyAcceptance onAccepted={accepted} onBusyChange={busy} />);
  await chooseBoth();
  fireEvent.submit(screen.getByRole("form"));
  unmount();
  await act(async () => finish());
  expect(accepted).not.toHaveBeenCalled();
  expect(busy.mock.calls).toEqual([[true]]);
});
