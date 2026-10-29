"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MovelyApiError, requestPhoneCode, verifyPhoneCode, type RequestPhoneCodeResponse, type VerifyPhoneCodeResponse } from "@/lib/movely-api";
import AuthServiceStatus, { useAuthCapabilities } from "./AuthServiceStatus";

export default function PhoneVerification({ initialPhone = "", disabled = false, onVerified, onBusyChange }: {
  initialPhone?: string; disabled?: boolean; onVerified: (result: VerifyPhoneCodeResponse) => void; onBusyChange?: (busy: boolean) => void;
}) {
  const { capabilities, failed, retry } = useAuthCapabilities();
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<Pick<RequestPhoneCodeResponse, "normalizedPhone" | "expiresAt"> | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [challengeProblem, setChallengeProblem] = useState("");
  const [status, setStatus] = useState("");
  const inFlight = useRef(false);
  const active = useRef(true);
  const phoneField = useRef<HTMLInputElement>(null);
  const codeField = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<"phone" | "code" | null>(null);
  const hintId = useId();
  const phoneErrorId = useId();
  const codeErrorId = useId();
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (busy || disabled || !pendingFocus.current) return;
    const target = pendingFocus.current === "phone" ? phoneField.current : codeField.current;
    if (target) { target.focus(); pendingFocus.current = null; }
  }, [busy, disabled, challenge, phoneError, codeError, challengeProblem]);
  useEffect(() => {
    if (!challenge && !resendAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge, resendAt]);
  const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const expired = challenge !== null && (!Number.isFinite(Date.parse(challenge.expiresAt)) || Date.parse(challenge.expiresAt) <= now);
  const codeFeedback = codeError || challengeProblem || (expired ? "תוקף הקוד פג. בקשו קוד חדש." : "");

  function showFailure(cause: unknown, fallback: string) {
    const message = cause instanceof MovelyApiError ? cause.message : fallback;
    if (cause instanceof MovelyApiError && cause.errorCode === "INVALID_PHONE_NUMBER") {
      pendingFocus.current = "phone"; setPhoneError(message);
    } else if (cause instanceof MovelyApiError && cause.errorCode === "OTP_CODE_INVALID") {
      pendingFocus.current = "code"; setCodeError(message);
    } else if (cause instanceof MovelyApiError && ["OTP_EXPIRED", "OTP_NOT_FOUND"].includes(cause.errorCode)) {
      pendingFocus.current = "code"; setChallengeProblem(message);
    } else setError(message);
  }

  async function sendCode() {
    if (disabled || inFlight.current || resendAt > Date.now()) return;
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) {
      pendingFocus.current = "phone"; setError(""); setPhoneError("הזינו מספר טלפון מלא, כולל קידומת."); phoneField.current?.focus(); return;
    }
    inFlight.current = true; setBusy(true); onBusyChange?.(true); setError(""); setPhoneError(""); setCodeError(""); setStatus("שולחים קוד אימות…");
    try {
      const result = await requestPhoneCode(phone.trim());
      if (!active.current) return;
      const receivedAt = Date.now();
      if (!result || typeof result.normalizedPhone !== "string" || !result.normalizedPhone.trim()
        || typeof result.expiresAt !== "string" || !Number.isFinite(Date.parse(result.expiresAt)) || Date.parse(result.expiresAt) <= receivedAt) {
        setChallenge(null); setCode(""); setChallengeProblem("");
        throw new Error("Invalid phone verification challenge.");
      }
      setNow(receivedAt);
      const serverResendAt = result.resendAvailableAt ? Date.parse(result.resendAvailableAt) : NaN;
      setResendAt(Number.isFinite(serverResendAt) ? serverResendAt : receivedAt + 60_000);
      setCode("");
      setChallengeProblem(""); pendingFocus.current = "code";
      // Do not retain or display any development debugCode returned by a test API.
      setChallenge({ normalizedPhone: result.normalizedPhone, expiresAt: result.expiresAt });
      setStatus("הקוד נשלח. הזינו אותו בשדה קוד האימות.");
    } catch (cause) {
      if (active.current) { setStatus(""); showFailure(cause, "לא הצלחנו לשלוח קוד. בדקו את החיבור ונסו שוב."); }
    } finally {
      inFlight.current = false;
      if (active.current) { setBusy(false); onBusyChange?.(false); }
    }
  }

  async function verify() {
    if (disabled || inFlight.current || !challenge || challengeProblem || !Number.isFinite(Date.parse(challenge.expiresAt)) || Date.parse(challenge.expiresAt) <= Date.now() || code.length !== 6) return;
    inFlight.current = true; setBusy(true); onBusyChange?.(true); setError(""); setCodeError(""); setStatus("בודקים את הקוד…");
    try {
      const result = await verifyPhoneCode(challenge.normalizedPhone, code);
      if (!active.current) return;
      if (result.phoneVerified) { setCode(""); setStatus("הטלפון אומת."); onVerified(result); }
      else { setStatus(""); setError("הטלפון עדיין לא אומת. בדקו את הקוד ונסו שוב."); }
    } catch (cause) {
      if (active.current) { setStatus(""); showFailure(cause, "לא הצלחנו לבדוק את הקוד. נסו שוב."); }
    } finally {
      inFlight.current = false;
      if (active.current) { setBusy(false); onBusyChange?.(false); }
    }
  }

  if (failed) return <AuthServiceStatus message="לא הצלחנו לבדוק את שירות אימות הטלפון. אפשר להמשיך לערוך את הטיוטה ולנסות שוב." retry={retry} />;
  if (!capabilities) return <p role="status">בודקים את שירות אימות הטלפון…</p>;
  if (!capabilities.phoneVerificationAvailable) return <AuthServiceStatus message="אימות טלפון בהודעת SMS עדיין אינו זמין. אפשר להמשיך לערוך ולשמור טיוטה, אך עדיין לא לפרסם בקשה." retry={retry} />;
  return <div className="space-y-4 text-base leading-7" aria-busy={busy}>
    <p id={hintId}>נשלח קוד לטלפון כדי לוודא שזה המספר שלכם. אין למסור את הקוד לאף אחד, גם לא למי שמציע עזרה.</p>
    <fieldset disabled={busy || disabled} className="space-y-4">
      <label className="field-label">מספר טלפון<input ref={phoneField} className="field-control" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" maxLength={24} aria-invalid={Boolean(phoneError) || undefined} aria-describedby={phoneError ? `${hintId} ${phoneErrorId}` : hintId} value={phone}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void sendCode(); } }}
        onChange={(event) => { setPhone(event.target.value); setChallenge(null); setCode(""); setError(""); setPhoneError(""); setCodeError(""); setChallengeProblem(""); setStatus(""); }} /></label>
      {phoneError && <p id={phoneErrorId} role="alert" className="text-red-900">{phoneError}</p>}
      <button type="button" onClick={() => { void sendCode(); }} disabled={!phone.trim() || resendSeconds > 0} className="button button-secondary">{challenge ? "שליחת קוד נוסף" : "שליחת קוד"}</button>
      {resendSeconds > 0 && <p className="text-slate-600">אפשר לבקש קוד נוסף בעוד {resendSeconds} שניות.</p>}
      {challenge && <>
        <p>הקוד נשלח אל <bdi dir="ltr">{challenge.normalizedPhone}</bdi>. לשינוי המספר, ערכו את השדה למעלה.</p>
        <label className="field-label">קוד אימות<input ref={codeField} className="field-control" type="text" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-invalid={Boolean(codeFeedback) || undefined} aria-describedby={codeFeedback ? codeErrorId : undefined} value={code}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void verify(); } }}
          onChange={(event) => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setCodeError(""); setError(""); }} /></label>
        {codeFeedback && <p id={codeErrorId} role={codeError || challengeProblem ? "alert" : "status"} className="text-red-900">{codeFeedback}</p>}
        <button type="button" onClick={() => { void verify(); }} disabled={expired || Boolean(challengeProblem) || code.length !== 6} className="button button-primary">אימות טלפון</button>
      </>}
    </fieldset>
    {status && <p role="status">{status}</p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">{error}</p>}
  </div>;
}
