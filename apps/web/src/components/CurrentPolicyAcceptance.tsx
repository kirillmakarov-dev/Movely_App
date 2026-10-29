"use client";

import { useEffect, useRef, useState } from "react";
import { acceptPolicies, MovelyApiError } from "@/lib/movely-api";
import AuthServiceStatus, { useAuthCapabilities } from "./AuthServiceStatus";
import PolicyConsentFields, { emptyPolicyChoice, policyPayload } from "./PolicyConsentFields";

export default function CurrentPolicyAcceptance({ disabled = false, onAccepted, onSessionInvalid, onBusyChange }: {
  disabled?: boolean; onAccepted: () => void; onSessionInvalid?: () => void; onBusyChange?: (busy: boolean) => void;
}) {
  const { capabilities, failed, retry } = useAuthCapabilities();
  const [choice, setChoice] = useState(emptyPolicyChoice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  async function accept() {
    if (inFlight.current || disabled || !capabilities?.policyAcceptanceAvailable || !choice.adultConfirmed || !choice.acceptTerms) return;
    inFlight.current = true; setBusy(true); setError(""); onBusyChange?.(true);
    let accepted = false;
    let sessionInvalid = false;
    try { await acceptPolicies(policyPayload(choice)); accepted = true; }
    catch (cause) {
      if (!active.current) return;
      sessionInvalid = cause instanceof MovelyApiError && [401, 403].includes(cause.status);
      if (sessionInvalid) setError("החיבור לחשבון אינו תקף. התחברו מחדש כדי לאשר את התנאים.");
      else if (cause instanceof MovelyApiError && cause.errorCode === "POLICY_VERSION_CHANGED") {
        setChoice(emptyPolicyChoice);
        setError("התנאים השתנו. רעננו את הדף, קראו את המסמכים המעודכנים ואשרו אותם מחדש.");
      } else setError("לא הצלחנו לשמור את האישורים. הבחירות נשמרו כאן; בדקו את החיבור ונסו שוב.");
    } finally {
      inFlight.current = false;
      if (active.current) {
        setBusy(false); onBusyChange?.(false);
        if (accepted) onAccepted();
        else if (sessionInvalid) onSessionInvalid?.();
      }
    }
  }

  if (failed) return <AuthServiceStatus message="לא הצלחנו לבדוק אם אפשר לאשר את התנאים. נסו לבדוק שוב." retry={retry} />;
  if (!capabilities) return <p role="status">בודקים את אפשרות אישור התנאים…</p>;
  if (!capabilities.policyAcceptanceAvailable) return <AuthServiceStatus message="אישור התנאים המעודכנים עדיין אינו זמין. אין צורך לצאת מהחשבון; אפשר לבדוק שוב מאוחר יותר." retry={retry} />;
  return <form onSubmit={(event) => { event.preventDefault(); void accept(); }} aria-label="אישור התנאים המעודכנים" aria-busy={busy} className="space-y-4 border-t border-slate-200 pt-5">
    <h2 className="text-xl font-bold">אישור התנאים המעודכנים</h2>
    <p className="text-base leading-7">לפני המשך הפעילות בחשבון, קראו את תנאי השימוש ואת הודעת הפרטיות ואשרו את שני הסעיפים. אין צורך להירשם מחדש.</p>
    <PolicyConsentFields value={choice} onChange={setChoice} disabled={busy || disabled} />
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">{error}</p>}
    {busy && <p role="status">שומרים את האישורים…</p>}
    <button type="submit" disabled={busy || disabled || !choice.adultConfirmed || !choice.acceptTerms} className="button button-primary">אישור והמשך</button>
  </form>;
}
