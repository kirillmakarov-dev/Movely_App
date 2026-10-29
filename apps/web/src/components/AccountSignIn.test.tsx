import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, beforeEach, afterEach, expect, test } from "vitest";
import AccountSignIn from "./AccountSignIn";
import { MovelyApiError } from "@/lib/movely-api";
import { LEGAL_DRAFT_VERSION } from "@/lib/legal-content";

const mocks = vi.hoisted(() => ({ capabilities: vi.fn(), signIn: vi.fn(), mount: vi.fn() }));
vi.mock("@/lib/movely-api", async () => ({ ...await vi.importActual("@/lib/movely-api"), getAuthCapabilities: mocks.capabilities, signInWithGoogle: mocks.signIn }));
vi.mock("@/lib/google-identity", () => ({ mountGoogleButton: mocks.mount }));
const enabled = { policyAcceptanceAvailable: true, googleSignInAvailable: true, googleClientId: "test.apps.googleusercontent.com", phoneVerificationAvailable: false };
let callback: (credential: string) => void;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.capabilities.mockReset().mockResolvedValue(enabled);
  mocks.signIn.mockReset().mockResolvedValue({ id: "user" });
  mocks.mount.mockImplementation(async (_element, _clientId, onCredential) => { callback = onCredential; return vi.fn(); });
});
afterEach(() => vi.useRealTimers());

test("a stalled capabilities request ends with a retry instead of indefinite loading", async () => {
  vi.useFakeTimers();
  mocks.capabilities.mockReturnValueOnce(new Promise(() => {}));
  render(<AccountSignIn onSignedIn={vi.fn()} />);
  await act(async () => vi.advanceTimersByTime(10_000));
  expect(screen.getByRole("button", { name: "בדיקה נוספת" })).toBeEnabled();
  expect(mocks.capabilities.mock.calls[0][0].aborted).toBe(true);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "בדיקה נוספת" })));
  expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  expect(mocks.mount).not.toHaveBeenCalled();
});

test("unavailable auth asks for no consent and never loads Google", async () => {
  mocks.capabilities.mockResolvedValue({ ...enabled, googleSignInAvailable: false, googleClientId: null });
  render(<AccountSignIn onSignedIn={vi.fn()} />);
  expect(await screen.findByText(/הכניסה לחשבון עדיין אינה זמינה/)).toBeVisible();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(mocks.mount).not.toHaveBeenCalled();
  expect(mocks.signIn).not.toHaveBeenCalled();
});

test("new registration requires both unselected choices before loading Google", async () => {
  const user = userEvent.setup();
  const completed = vi.fn();
  render(<AccountSignIn onSignedIn={completed} />);
  const choices = await screen.findAllByRole("checkbox");
  choices.forEach((choice) => expect(choice).not.toBeChecked());
  expect(mocks.mount).not.toHaveBeenCalled();
  await user.click(choices[0]);
  expect(mocks.mount).not.toHaveBeenCalled();
  await user.click(choices[1]);
  await waitFor(() => expect(mocks.mount).toHaveBeenCalledOnce());
  await act(async () => callback("google-issued-token"));
  expect(mocks.signIn).toHaveBeenCalledWith("google-issued-token", { adultConfirmed: true, acceptTerms: true, termsVersion: LEGAL_DRAFT_VERSION, privacyVersion: LEGAL_DRAFT_VERSION });
  expect(completed).toHaveBeenCalledWith({ id: "user" });
});

test("returning login sends no repeated acceptance and ignores duplicate callback", async () => {
  let finish!: (value: unknown) => void;
  mocks.signIn.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const onBusy = vi.fn();
  render(<AccountSignIn onSignedIn={vi.fn()} onBusyChange={onBusy} />);
  fireEvent.click(await screen.findByRole("button", { name: "כבר יש לי חשבון" }));
  await waitFor(() => expect(mocks.mount).toHaveBeenCalledOnce());
  act(() => { callback("token"); callback("token"); });
  expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith("token", undefined);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "יצירת חשבון" })).toBeDisabled();
  await act(async () => finish({ id: "user" }));
  expect(onBusy.mock.calls).toEqual([[true], [false]]);
});

test("login without required policy acceptance returns to explicit registration", async () => {
  mocks.signIn.mockRejectedValue(new MovelyApiError("Acceptance needed", { errorCode: "POLICY_ACCEPTANCE_REQUIRED", status: 400 }));
  render(<AccountSignIn onSignedIn={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "כבר יש לי חשבון" }));
  await waitFor(() => expect(mocks.mount).toHaveBeenCalledOnce());
  await act(async () => callback("token"));
  expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  expect(screen.getByRole("alert")).toHaveTextContent("לחשבון חדש או לעדכון האישורים");
  expect(mocks.signIn).toHaveBeenCalledOnce();
});

test("failed service lookup can retry without losing the page", async () => {
  mocks.capabilities.mockRejectedValueOnce(new TypeError("offline"));
  render(<AccountSignIn onSignedIn={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "בדיקה נוספת" }));
  expect(await screen.findAllByRole("checkbox")).toHaveLength(2);
  expect(mocks.capabilities).toHaveBeenCalledTimes(2);
});

test("revoking consent removes the button and ignores its stale callback", async () => {
  const user = userEvent.setup();
  render(<AccountSignIn onSignedIn={vi.fn()} />);
  const choices = await screen.findAllByRole("checkbox");
  await user.click(choices[0]); await user.click(choices[1]);
  await waitFor(() => expect(mocks.mount).toHaveBeenCalledOnce());
  const stale = callback;
  await user.click(choices[0]);
  await act(async () => stale("late-token"));
  expect(mocks.signIn).not.toHaveBeenCalled();
});

test("failed Google script offers retry and recovers", async () => {
  mocks.mount.mockRejectedValueOnce(new Error("script blocked"));
  render(<AccountSignIn onSignedIn={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "כבר יש לי חשבון" }));
  fireEvent.click(await screen.findByRole("button", { name: "טעינת Google מחדש" }));
  await waitFor(() => expect(mocks.mount).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
});
