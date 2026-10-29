import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import PhoneVerification from "./PhoneVerification";
import { MovelyApiError } from "@/lib/movely-api";

const mocks = vi.hoisted(() => ({ capabilities: vi.fn(), send: vi.fn(), verify: vi.fn() }));
vi.mock("@/lib/movely-api", async () => ({ ...await vi.importActual("@/lib/movely-api"), getAuthCapabilities: mocks.capabilities, requestPhoneCode: mocks.send, verifyPhoneCode: mocks.verify }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.capabilities.mockResolvedValue({ policyAcceptanceAvailable: true, googleSignInAvailable: true, googleClientId: "test.apps.googleusercontent.com", phoneVerificationAvailable: true });
  mocks.send.mockResolvedValue({ normalizedPhone: "+972501234567", debugCode: "654321", expiresAt: new Date(Date.now() + 600_000).toISOString(), resendAvailableAt: new Date(Date.now() + 60_000).toISOString() });
  mocks.verify.mockResolvedValue({ phoneVerified: true, normalizedPhone: "+972501234567" });
});
afterEach(() => vi.useRealTimers());

test("unavailable SMS collects no phone or code", async () => {
  mocks.capabilities.mockResolvedValue({ phoneVerificationAvailable: false });
  render(<PhoneVerification onVerified={vi.fn()} />);
  expect(await screen.findByText(/אימות טלפון בהודעת SMS עדיין אינו זמין/)).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(mocks.send).not.toHaveBeenCalled();
});

test("send then verify uses the challenged number, no debug autofill, and locks resend", async () => {
  const verified = vi.fn();
  render(<PhoneVerification onVerified={verified} />);
  const phone = await screen.findByLabelText("מספר טלפון");
  expect(phone).toHaveValue("");
  expect(screen.queryByLabelText("קוד אימות")).not.toBeInTheDocument();
  fireEvent.change(phone, { target: { value: "0501234567" } });
  fireEvent.click(screen.getByRole("button", { name: "שליחת קוד" }));
  const code = await screen.findByLabelText("קוד אימות");
  expect(code).toHaveValue("");
  await waitFor(() => expect(code).toHaveFocus());
  expect(screen.queryByText(/654321/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "שליחת קוד נוסף" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "אימות טלפון" })).toBeDisabled();
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "אימות טלפון" }));
  await waitFor(() => expect(verified).toHaveBeenCalledWith({ phoneVerified: true, normalizedPhone: "+972501234567" }));
  expect(mocks.verify).toHaveBeenCalledExactlyOnceWith("+972501234567", "123456");
});

test("editing the phone clears previous challenge and code but retains cooldown", async () => {
  render(<PhoneVerification onVerified={vi.fn()} initialPhone="0501234567" />);
  fireEvent.click(await screen.findByRole("button", { name: "שליחת קוד" }));
  fireEvent.change(await screen.findByLabelText("קוד אימות"), { target: { value: "123456" } });
  fireEvent.change(screen.getByLabelText("מספר טלפון"), { target: { value: "0521234567" } });
  expect(screen.queryByLabelText("קוד אימות")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "אימות טלפון" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "שליחת קוד" })).toBeDisabled();
  expect(mocks.verify).not.toHaveBeenCalled();
});

test("expired code cannot be verified and resend uses server availability", async () => {
  vi.useFakeTimers();
  mocks.send.mockResolvedValue({ normalizedPhone: "+972501234567", expiresAt: new Date(Date.now() + 2000).toISOString(), resendAvailableAt: new Date(Date.now() + 1000).toISOString() });
  render(<PhoneVerification onVerified={vi.fn()} initialPhone="0501234567" />);
  await act(async () => {});
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "שליחת קוד" })));
  fireEvent.change(screen.getByLabelText("קוד אימות"), { target: { value: "123456" } });
  await act(async () => vi.advanceTimersByTime(3000));
  expect(screen.getByRole("button", { name: "אימות טלפון" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "שליחת קוד נוסף" })).toBeEnabled();
  expect(screen.getByText(/תוקף הקוד פג/)).toBeVisible();
});

test("failed delivery never claims a code was sent and allows retry", async () => {
  mocks.send.mockRejectedValueOnce(new MovelyApiError("שירות SMS לא זמין", { errorCode: "SMS_NOT_CONFIGURED", status: 503 }));
  render(<PhoneVerification onVerified={vi.fn()} initialPhone="0501234567" />);
  fireEvent.click(await screen.findByRole("button", { name: "שליחת קוד" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("שירות SMS לא זמין");
  expect(screen.getByLabelText("מספר טלפון")).not.toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("מספר טלפון")).not.toHaveAccessibleDescription(/שירות SMS לא זמין/);
  expect(screen.queryByLabelText("קוד אימות")).not.toBeInTheDocument();
  expect(screen.queryByText(/הקוד נשלח/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "שליחת קוד" }));
  expect(await screen.findByLabelText("קוד אימות")).toBeVisible();
});

test("local phone validation links its error and clears it when corrected", async () => {
  render(<PhoneVerification onVerified={vi.fn()} initialPhone="123" />);
  const phone = await screen.findByLabelText("מספר טלפון");
  fireEvent.keyDown(phone, { key: "Enter" });
  expect(phone).toHaveAttribute("aria-invalid", "true");
  expect(phone).toHaveAccessibleDescription(/הזינו מספר טלפון מלא/);
  expect(phone).toHaveFocus();
  expect(mocks.send).not.toHaveBeenCalled();
  fireEvent.change(phone, { target: { value: "0501234567" } });
  expect(phone).not.toHaveAttribute("aria-invalid", "true");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("server phone error focuses its linked field only after the parent unlocks it", async () => {
  let rejectSend!: (error: Error) => void;
  mocks.send.mockReturnValue(new Promise((_, reject) => { rejectSend = reject; }));
  const props = { onVerified: vi.fn(), initialPhone: "0501234567" };
  const { rerender } = render(<PhoneVerification {...props} />);
  const phone = await screen.findByLabelText("מספר טלפון");
  fireEvent.click(screen.getByRole("button", { name: "שליחת קוד" }));
  rerender(<PhoneVerification {...props} disabled />);
  await act(async () => rejectSend(new MovelyApiError("בדקו את מספר הטלפון", { errorCode: "INVALID_PHONE_NUMBER", status: 400 })));
  expect(phone).toBeDisabled();
  expect(phone).not.toHaveFocus();
  expect(phone).toHaveAttribute("aria-invalid", "true");
  expect(phone).toHaveAccessibleDescription(/בדקו את מספר הטלפון/);
  rerender(<PhoneVerification {...props} />);
  expect(phone).toBeEnabled();
  expect(phone).toHaveFocus();
});

test.each(["OTP_CODE_INVALID", "OTP_EXPIRED", "OTP_NOT_FOUND"])("%s is linked to the code and focuses it after verification", async (errorCode) => {
  mocks.verify.mockRejectedValue(new MovelyApiError("בדקו את הקוד או בקשו קוד חדש", { errorCode, status: 400 }));
  render(<PhoneVerification onVerified={vi.fn()} initialPhone="0501234567" />);
  fireEvent.click(await screen.findByRole("button", { name: "שליחת קוד" }));
  const code = await screen.findByLabelText("קוד אימות");
  fireEvent.change(code, { target: { value: "123456" } });
  const verify = screen.getByRole("button", { name: "אימות טלפון" });
  verify.focus();
  fireEvent.click(verify);
  await waitFor(() => expect(code).toHaveAttribute("aria-invalid", "true"));
  expect(code).toHaveAccessibleDescription("בדקו את הקוד או בקשו קוד חדש");
  expect(code).toBeEnabled();
  await waitFor(() => expect(code).toHaveFocus());
  fireEvent.change(code, { target: { value: "123457" } });
  if (errorCode === "OTP_CODE_INVALID") {
    expect(code).not.toHaveAttribute("aria-invalid", "true");
    expect(verify).toBeEnabled();
  } else {
    expect(code).toHaveAttribute("aria-invalid", "true");
    expect(verify).toBeDisabled();
    fireEvent.keyDown(code, { key: "Enter" });
    expect(mocks.verify).toHaveBeenCalledTimes(1);
  }
});

test("Enter sends and verifies while respecting in-flight and resend locks", async () => {
  const verified = vi.fn();
  render(<PhoneVerification onVerified={verified} initialPhone="0501234567" />);
  const phone = await screen.findByLabelText("מספר טלפון");
  fireEvent.keyDown(phone, { key: "Enter" });
  fireEvent.keyDown(phone, { key: "Enter" });
  const code = await screen.findByLabelText("קוד אימות");
  fireEvent.keyDown(phone, { key: "Enter" });
  expect(mocks.send).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(code, { key: "Enter" });
  expect(mocks.verify).not.toHaveBeenCalled();
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.keyDown(code, { key: "Enter" });
  fireEvent.keyDown(code, { key: "Enter" });
  await waitFor(() => expect(verified).toHaveBeenCalledTimes(1));
  expect(mocks.verify).toHaveBeenCalledTimes(1);
});

test("verification network errors remain form-level without marking the code invalid", async () => {
  mocks.verify.mockRejectedValue(new Error("Network unavailable"));
  render(<PhoneVerification onVerified={vi.fn()} initialPhone="0501234567" />);
  fireEvent.click(await screen.findByRole("button", { name: "שליחת קוד" }));
  const code = await screen.findByLabelText("קוד אימות");
  await waitFor(() => expect(code).toHaveFocus());
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "אימות טלפון" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/לא הצלחנו לבדוק את הקוד/);
  expect(code).not.toHaveAttribute("aria-invalid", "true");
  expect(code).not.toHaveAttribute("aria-describedby");
  expect(screen.getByRole("button", { name: "אימות טלפון" })).toBeEnabled();
});

test.each(["not-a-date", "1970-01-01T00:00:00Z"])("invalid or stale challenge expiration %s never enables verification", async (expiresAt) => {
  mocks.send.mockResolvedValue({ normalizedPhone: "+972501234567", expiresAt });
  render(<PhoneVerification onVerified={vi.fn()} initialPhone="0501234567" />);
  fireEvent.click(await screen.findByRole("button", { name: "שליחת קוד" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/לא הצלחנו לשלוח קוד/);
  expect(screen.queryByLabelText("קוד אימות")).not.toBeInTheDocument();
  expect(screen.queryByText(/הקוד נשלח/)).not.toBeInTheDocument();
  expect(mocks.verify).not.toHaveBeenCalled();
});
