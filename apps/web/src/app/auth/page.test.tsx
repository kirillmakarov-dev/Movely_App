import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import AuthPage from "./page";
import type { CurrentUser, VerifyPhoneCodeResponse } from "@/lib/movely-api";
import { MovelyApiError } from "@/lib/movely-api";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(), capabilities: vi.fn(), signIn: vi.fn(), sendCode: vi.fn(), verifyCode: vi.fn(), logout: vi.fn(), mount: vi.fn(), accept: vi.fn(),
}));
vi.mock("@/lib/movely-api", async () => ({
  ...await vi.importActual("@/lib/movely-api"),
  getCurrentUser: mocks.currentUser, getAuthCapabilities: mocks.capabilities,
  signInWithGoogle: mocks.signIn, requestPhoneCode: mocks.sendCode, verifyPhoneCode: mocks.verifyCode, logout: mocks.logout,
  acceptPolicies: mocks.accept,
}));
vi.mock("@/lib/google-identity", () => ({ mountGoogleButton: mocks.mount }));

const customer: CurrentUser = {
  id: "account-page-user", firstName: "נועה", lastName: "כהן", email: "test@example.com", phone: null,
  phoneVerified: false, role: "Customer", businessId: null, businessStatus: null, subscriptionStatus: null,
  hasCurrentPolicyAcceptance: true,
};
const enabled = {
  policyAcceptanceAvailable: true, googleSignInAvailable: true, googleClientId: "test.apps.googleusercontent.com", phoneVerificationAvailable: true,
};
let credentialCallback: (credential: string) => void;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.currentUser.mockResolvedValue(null);
  mocks.capabilities.mockResolvedValue(enabled);
  mocks.signIn.mockResolvedValue(customer);
  mocks.sendCode.mockResolvedValue({
    normalizedPhone: "+972501234567", debugCode: "654321", expiresAt: new Date(Date.now() + 600_000).toISOString(),
    resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
  });
  mocks.verifyCode.mockResolvedValue({ phoneVerified: true, normalizedPhone: "+972501234567" });
  mocks.logout.mockResolvedValue(undefined);
  mocks.accept.mockResolvedValue(undefined);
  mocks.mount.mockImplementation(async (_element, _clientId, callback) => { credentialCallback = callback; return vi.fn(); });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

test("logged-in account accepts current policy without logout or Google and keeps its account links", async () => {
  mocks.currentUser.mockResolvedValue({ ...customer, phoneVerified: true, hasCurrentPolicyAcceptance: false });
  mocks.capabilities.mockResolvedValue({ ...enabled, googleSignInAvailable: false, googleClientId: null });
  render(<AuthPage />);
  for (const choice of await screen.findAllByRole("checkbox")) { expect(choice).not.toBeChecked(); fireEvent.click(choice); }
  fireEvent.click(screen.getByRole("button", { name: "אישור והמשך" }));
  expect(await screen.findByText("התנאים אושרו. אפשר להמשיך לפעילות בחשבון.")).toBeVisible();
  expect(screen.queryByRole("form", { name: "אישור התנאים המעודכנים" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "יציאה", exact: true })).toBeEnabled();
  expect(screen.getByRole("link", { name: "מעבר לבקשות שלי" })).toHaveAttribute("href", "/account/requests");
  expect(screen.getByRole("link", { name: "הפרופיל העסקי שלי" })).toHaveAttribute("href", "/mover/profile");
  expect(mocks.mount).not.toHaveBeenCalled();
  expect(mocks.logout).not.toHaveBeenCalled();
});

test("expired session during policy acceptance clears the logged-in account and offers sign-in", async () => {
  mocks.currentUser.mockResolvedValue({ ...customer, phoneVerified: true, hasCurrentPolicyAcceptance: false });
  mocks.accept.mockRejectedValue(new MovelyApiError("private", { status: 401, errorCode: "SESSION_INVALID" }));
  render(<AuthPage />);
  for (const choice of await screen.findAllByRole("checkbox")) fireEvent.click(choice);
  fireEvent.click(screen.getByRole("button", { name: "אישור והמשך" }));
  expect(await screen.findByRole("heading", { name: "כניסה או הרשמה" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "ברוכים הבאים, נועה" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "הפרופיל העסקי שלי" })).not.toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "כבר יש לי חשבון" })).toBeEnabled();
  expect(mocks.logout).not.toHaveBeenCalled();
});

test.each(["Mover", "Admin"] as const)("%s receives only applicable account links and phone actions", async (role) => {
  mocks.currentUser.mockResolvedValue({ ...customer, role });
  render(<AuthPage />);
  await screen.findByRole("heading", { name: "ברוכים הבאים, נועה" });
  expect(screen.queryByRole("link", { name: "מעבר לבקשות שלי" })).not.toBeInTheDocument();
  if (role === "Mover") {
    expect(await screen.findByLabelText("מספר טלפון")).toBeVisible();
    expect(screen.getByRole("link", { name: "הפרופיל העסקי שלי" })).toHaveAttribute("href", "/mover/profile");
    expect(screen.queryByRole("link", { name: "בדיקת עסקים" })).not.toBeInTheDocument();
  } else {
    expect(screen.queryByRole("region", { name: "אימות טלפון" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("מספר טלפון")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "הפרופיל העסקי שלי" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "בדיקת עסקים" })).toHaveAttribute("href", "/admin/businesses");
    expect(mocks.capabilities).not.toHaveBeenCalled();
  }
});

test("account page completes real component login and phone verification, releasing parent busy state", async () => {
  let finishSignIn!: (value: CurrentUser) => void;
  let finishVerification!: (value: VerifyPhoneCodeResponse) => void;
  mocks.signIn.mockReturnValue(new Promise<CurrentUser>((resolve) => { finishSignIn = resolve; }));
  mocks.verifyCode.mockReturnValue(new Promise<VerifyPhoneCodeResponse>((resolve) => { finishVerification = resolve; }));
  render(<AuthPage />);

  fireEvent.click(await screen.findByRole("button", { name: "כבר יש לי חשבון" }));
  await waitFor(() => expect(mocks.mount).toHaveBeenCalledOnce());
  act(() => credentialCallback("credential-from-google"));
  expect(screen.getByRole("button", { name: "יצירת חשבון" })).toBeDisabled();
  expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith("credential-from-google", undefined);
  await act(async () => finishSignIn(customer));

  expect(await screen.findByRole("heading", { name: "ברוכים הבאים, נועה" })).toBeVisible();
  const phone = await screen.findByLabelText("מספר טלפון");
  expect(phone).toBeEnabled();
  expect(phone).toHaveValue("");
  expect(screen.getByRole("button", { name: "יציאה", exact: true })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "כבר יש לי חשבון" })).not.toBeInTheDocument();
  fireEvent.change(phone, { target: { value: "0501234567" } });
  fireEvent.click(screen.getByRole("button", { name: "שליחת קוד", exact: true }));
  const code = await screen.findByLabelText("קוד אימות");
  expect(code).toHaveValue("");
  expect(code).toBeEnabled();
  expect(screen.queryByText(/654321/)).not.toBeInTheDocument();
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "אימות טלפון", exact: true }));
  expect(screen.getByRole("button", { name: "יציאה", exact: true })).toBeDisabled();
  expect(mocks.verifyCode).toHaveBeenCalledExactlyOnceWith("+972501234567", "123456");
  await act(async () => finishVerification({ phoneVerified: true, normalizedPhone: "+972501234567" }));
  expect(await screen.findByText("הטלפון שלכם מאומת.")).toBeVisible();
  expect(screen.queryByLabelText("קוד אימות")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "יציאה", exact: true })).toBeEnabled();
  expect(screen.getByRole("link", { name: "מעבר לבקשות שלי" })).toHaveAttribute("href", "/account/requests");
});

test("unavailable registration keeps anonymous draft path and contains no developer inputs", async () => {
  mocks.capabilities.mockResolvedValue({ ...enabled, policyAcceptanceAvailable: false, googleSignInAvailable: false, googleClientId: null, phoneVerificationAvailable: false });
  render(<AuthPage />);
  expect(await screen.findByText(/פתיחת חשבונות לציבור עדיין אינה זמינה/)).toBeVisible();
  expect(screen.getByRole("link", { name: "הכנת בקשה בלי להתחבר" })).toHaveAttribute("href", "/request/new");
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent("dev-google:");
  expect(document.body).not.toHaveTextContent("קוד פיתוח");
  expect(document.body).not.toHaveTextContent("050-123-4567");
  expect(mocks.mount).not.toHaveBeenCalled();
  expect(mocks.signIn).not.toHaveBeenCalled();
});

test("signed-in account with unavailable SMS does not collect phone or offer fake verification", async () => {
  mocks.currentUser.mockResolvedValue(customer);
  mocks.capabilities.mockResolvedValue({ ...enabled, phoneVerificationAvailable: false });
  render(<AuthPage />);
  expect(await screen.findByText(/אימות טלפון בהודעת SMS עדיין אינו זמין/)).toBeVisible();
  expect(screen.queryByLabelText("מספר טלפון")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("קוד אימות")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "יציאה", exact: true })).toBeEnabled();
  expect(mocks.sendCode).not.toHaveBeenCalled();
  expect(mocks.verifyCode).not.toHaveBeenCalled();
});

test("failed logout keeps the account visible and a later successful logout restores sign-in", async () => {
  mocks.currentUser.mockResolvedValue({ ...customer, phoneVerified: true });
  mocks.logout.mockRejectedValueOnce(new TypeError("network failure"));
  render(<AuthPage />);
  fireEvent.click(await screen.findByRole("button", { name: "יציאה", exact: true }));
  expect(await screen.findByText(/לא הצלחנו לנתק אתכם/)).toBeVisible();
  expect(screen.getByRole("heading", { name: "ברוכים הבאים, נועה" })).toBeVisible();
  expect(screen.getByRole("button", { name: "יציאה", exact: true })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "כבר יש לי חשבון" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "יציאה", exact: true }));
  expect(await screen.findByText("יצאתם מהחשבון.")).toBeVisible();
  expect(await screen.findByRole("button", { name: "כבר יש לי חשבון" })).toBeEnabled();
  expect(screen.queryByRole("heading", { name: "ברוכים הבאים, נועה" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "יציאה", exact: true })).not.toBeInTheDocument();
  expect(mocks.logout).toHaveBeenCalledTimes(2);
});

test("session lookup failure is reported without claiming a successful logout", async () => {
  mocks.currentUser.mockRejectedValue(new TypeError("offline"));
  render(<AuthPage />);
  expect(await screen.findByText(/לא הצלחנו לבדוק אם אתם מחוברים/)).toBeVisible();
  expect(await screen.findByRole("button", { name: "כבר יש לי חשבון" })).toBeEnabled();
  expect(screen.queryByText("יצאתם מהחשבון.")).not.toBeInTheDocument();
  expect(mocks.logout).not.toHaveBeenCalled();
});

test("a stalled session check times out, preserves sign-in access, and can recover through retry", async () => {
  vi.useFakeTimers();
  mocks.currentUser.mockImplementationOnce(() => new Promise<CurrentUser | null>(() => {}))
    .mockResolvedValueOnce({ ...customer, phoneVerified: true });
  render(<AuthPage />);
  expect(screen.getByText("בודקים אם אתם מחוברים…")).toBeVisible();
  await act(async () => vi.advanceTimersByTime(10_001));
  expect(screen.queryByText("בודקים אם אתם מחוברים…")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "כבר יש לי חשבון" })).toBeEnabled();
  expect(mocks.mount).not.toHaveBeenCalled();
  const signal = mocks.currentUser.mock.calls[0][0] as AbortSignal;
  expect(signal.aborted).toBe(true);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "בדיקת החיבור מחדש" })));
  expect(screen.getByRole("heading", { name: "ברוכים הבאים, נועה" })).toBeVisible();
  expect(screen.getByRole("button", { name: "יציאה", exact: true })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "בדיקת החיבור מחדש" })).not.toBeInTheDocument();
  expect(mocks.currentUser).toHaveBeenCalledTimes(2);
});
