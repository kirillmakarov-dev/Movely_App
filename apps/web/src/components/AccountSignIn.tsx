"use client";

import { useEffect, useRef, useState } from "react";
import { signInWithGoogle, MovelyApiError, type CurrentUser } from "@/lib/movely-api";
import PolicyConsentFields, { emptyPolicyChoice, policyPayload } from "./PolicyConsentFields";
import GoogleSignInButton from "./GoogleSignInButton";
import AuthServiceStatus, { useAuthCapabilities } from "./AuthServiceStatus";

export default function AccountSignIn({ disabled = false, onSignedIn, onBusyChange }: {
  disabled?: boolean; onSignedIn: (user: CurrentUser) => void; onBusyChange?: (busy: boolean) => void;
}) {
  const { capabilities, failed, retry } = useAuthCapabilities();
  const [register, setRegister] = useState(true);
  const [choice, setChoice] = useState(emptyPolicyChoice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  async function signIn(credential: string) {
    if (inFlight.current || disabled || (register && (!choice.adultConfirmed || !choice.acceptTerms))) return;
    inFlight.current = true; setBusy(true); setError(""); onBusyChange?.(true);
    try {
      const user = await signInWithGoogle(credential, register ? policyPayload(choice) : undefined);
      if (active.current) onSignedIn(user);
    } catch (cause) {
      if (!active.current) return;
      if (cause instanceof MovelyApiError && cause.errorCode === "POLICY_ACCEPTANCE_REQUIRED") {
        setRegister(true);
        setError("לחשבון חדש או לעדכון האישורים, קראו את הסעיפים ואשרו אותם. לאחר מכן בחרו שוב את חשבון Google שלכם.");
      } else setError(cause instanceof MovelyApiError ? cause.message : "לא הצלחנו להתחבר. בדקו את החיבור ונסו שוב; פרטי הטיוטה נשארו בטופס.");
    } finally {
      inFlight.current = false;
      if (active.current) { setBusy(false); onBusyChange?.(false); }
    }
  }

  if (failed) return <AuthServiceStatus message="לא הצלחנו להתחבר לשירות החשבון. אפשר להמשיך לערוך את הטיוטה ולנסות שוב." retry={retry} />;
  if (!capabilities) return <p role="status" className="text-base leading-7">בודקים את אפשרויות הכניסה…</p>;
  if (!capabilities.googleSignInAvailable || !capabilities.googleClientId) return <AuthServiceStatus
    message={capabilities.policyAcceptanceAvailable ? "הכניסה לחשבון עדיין אינה זמינה. אפשר להמשיך להכין טיוטה; בטופס הבקשה ניתן לבחור לשמור אותה בכרטיסייה." : "פתיחת חשבונות לציבור עדיין אינה זמינה. אפשר לעיין באתר ולהכין טיוטה לפני פתיחת השירות."} retry={retry} />;
  const ready = !register || (choice.adultConfirmed && choice.acceptTerms);
  return <div className="space-y-4" aria-busy={busy}>
    <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="כניסה או הרשמה">
      <button type="button" aria-pressed={register} disabled={busy || disabled} className={`button ${register ? "button-primary" : "button-secondary"}`} onClick={() => { setRegister(true); setError(""); }}>יצירת חשבון</button>
      <button type="button" aria-pressed={!register} disabled={busy || disabled} className={`button ${!register ? "button-primary" : "button-secondary"}`} onClick={() => { setRegister(false); setError(""); }}>כבר יש לי חשבון</button>
    </div>
    <p className="text-base leading-7">בחרו את חשבון Google שלכם. אין צורך להזין כאן את סיסמת Google.</p>
    {register && <PolicyConsentFields value={choice} onChange={setChoice} disabled={busy || disabled} />}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-base leading-7 text-red-900">{error}</p>}
    {busy ? <p role="status" className="text-base leading-7">מתחברים…</p> : ready && !disabled
      ? <GoogleSignInButton key={register ? "register" : "login"} clientId={capabilities.googleClientId} onCredential={(credential) => { void signIn(credential); }} />
      : !ready && <p className="text-base leading-7 text-slate-600">להרשמה חדשה, קראו ואשרו את שני הסעיפים. לאחר מכן תופיע אפשרות הכניסה עם Google.</p>}
    <p className="text-sm leading-6 text-slate-600">אם סגרתם את חלון Google, אפשר לבחור שוב בכפתור הכניסה.</p>
  </div>;
}
