"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "@/components/SafeLink";
import { getCurrentUser, MovelyApiError, type BusinessStatus } from "@/lib/movely-api";
import { boundedBusinessRequest, type BusinessProfile } from "@/lib/business-api";

export const businessStatusLabels: Record<BusinessStatus, string> = { PendingVerification: "ממתין לבדיקה", Verified: "מאומת", Rejected: "נדרשים תיקונים", Suspended: "הגישה הושעתה" };
export function useBusinessResource<T>(load: (signal: AbortSignal) => Promise<T>, key: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; attempt: number } & ({ kind: "loading" } | { kind: "ready"; data: T } | { kind: "error"; error: unknown })>({ key, attempt: 0, kind: "loading" });
  const retry = useCallback(() => setAttempt((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    void boundedBusinessRequest(load, controller.signal).then((data) => { if (active) setState({ key, attempt, kind: "ready", data }); }).catch((error: unknown) => { if (active) setState({ key, attempt, kind: "error", error }); });
    return () => { active = false; controller.abort(); };
  }, [load, key, attempt]);
  const view = state.key === key && state.attempt === attempt ? state : { kind: "loading" as const, key, attempt };
  return { ...view, retry };
}
export function businessErrorCopy(error: unknown) {
  if (!(error instanceof MovelyApiError)) return "לא הצלחנו להשלים את הפעולה. בדקו את החיבור ונסו שוב.";
  if (error.status === 401) return "יש להתחבר שוב לחשבון המתאים.";
  const copies: Record<string, string> = {
    POLICY_ACCEPTANCE_REQUIRED: "קראו ואשרו את התנאים המעודכנים בחשבון, ואז בדקו שוב את הרשאות החשבון כאן.",
    PHONE_NOT_VERIFIED: "יש לאמת את מספר הטלפון בחשבון לפני שליחת פרטי העסק.",
    LEGAL_NOT_READY: "שליחת פרופילים עסקיים עדיין אינה פתוחה. אפשר לבדוק שוב מאוחר יותר.",
    BUSINESS_REVISION_CONFLICT: "פרטי העסק השתנו. טענו את המצב העדכני ובדקו אותו לפני שמירה נוספת. הטופס שלכם נשמר כאן.",
    BUSINESS_ALREADY_EXISTS: "כבר קיים עסק בחשבון. טענו את פרטיו לפני ניסיון נוסף.",
    BUSINESS_SUSPENDED: "העסק מושעה ולא ניתן לערוך אותו כרגע.",
    BUSINESS_NOT_FOUND: "העסק לא נמצא או אינו זמין בחשבון הזה.",
    INVALID_BUSINESS_PROFILE: "בדקו את פרטי העסק ואת אזורי השירות ותקנו את השדות לפני שליחה.",
    INVALID_BUSINESS_STATE: "מצב העסק השתנה. טענו את המצב העדכני לפני פעולה נוספת.",
    INVALID_BUSINESS_REVIEW: "בדקו את ההחלטה, הנימוקים ואישורי הבדיקה הנדרשים.",
    SELF_REVIEW_FORBIDDEN: "לא ניתן לבדוק עסק שבבעלות חשבון הבודק.",
    REVERIFICATION_CONFIRMATION_REQUIRED: "יש לאשר שהשינוי יעביר את העסק לבדיקה חוזרת.",
    REPRESENTATIVE_CONFIRMATION_REQUIRED: "יש לאשר שאתם מורשים לייצג את העסק.",
    BUSINESS_READ_TIMEOUT: "טעינת הפרטים נמשכת זמן רב מדי. אפשר לנסות שוב.",
  };
  return copies[error.errorCode] ?? (error.status === 403 ? "אין הרשאה לצפות בפרטים או לבצע את הפעולה בחשבון הזה." : error.status === 429 ? "יש להמתין מעט לפני ניסיון נוסף." : "לא הצלחנו להשלים את הפעולה. אפשר לנסות שוב מאוחר יותר.");
}
export function denied(error: unknown) { return error instanceof MovelyApiError && (error.status === 401 || (error.status === 403 && !["PHONE_NOT_VERIFIED", "POLICY_ACCEPTANCE_REQUIRED", "BUSINESS_SUSPENDED"].includes(error.errorCode))); }
export function uncertain(error: unknown) { return !(error instanceof MovelyApiError) || error.status === 0 || error.status >= 500; }
export function BusinessError({ error, retry }: { error: unknown; retry?: () => void }) {
  const accountRequired = error instanceof MovelyApiError && ["PHONE_NOT_VERIFIED", "POLICY_ACCEPTANCE_REQUIRED"].includes(error.errorCode);
  return <section role="alert" className="rounded-xl border border-slate-200 bg-white p-5"><p className="leading-7">{businessErrorCopy(error)}</p><div className="mt-4 flex flex-wrap gap-3">{accountRequired ? <Link href="/auth" target="_blank" rel="noopener noreferrer" className="button button-primary">השלמת החשבון (לשונית חדשה)</Link> : error instanceof MovelyApiError && [401, 403].includes(error.status) ? <Link href="/auth" className="button button-primary">כניסה לחשבון</Link> : null}{retry ? <button type="button" className="button button-secondary" onClick={retry}>ניסיון נוסף</button> : null}</div></section>;
}
export function BusinessSummary({ profile }: { profile: BusinessProfile }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">{profile.name || "הפרופיל העסקי"}</h2><p className="mt-2 font-bold">מצב: {businessStatusLabels[profile.status]}</p><dl className="mt-4 grid gap-4 sm:grid-cols-2">{[["מספר עוסק / ח.פ.", profile.registrationNumber], ["כתובת העסק הרשומה", profile.registeredAddress], ["נציג העסק", profile.representativeName], ["אזורי שירות", profile.serviceAreas.map((v) => v.name).join(" · ")]].map(([label, value]) => <div className="min-w-0" key={label}><dt className="text-sm text-slate-600">{label}</dt><dd className="break-words whitespace-pre-wrap">{value || "לא צוין"}</dd></div>)}</dl>{profile.latestReview?.ownerMessage ? <div className="mt-4 border-t border-slate-200 pt-4"><h3 className="font-bold">הודעה מצוות הבדיקה</h3><p className="mt-2 whitespace-pre-wrap break-words leading-7">{profile.latestReview.ownerMessage}</p></div> : null}</section>;
}
export function AdminGate({ children, onIdentity }: { children: ReactNode | ((adminId: string) => ReactNode); onIdentity?: (adminId: string | null) => void }) {
  const load = useCallback((signal: AbortSignal) => getCurrentUser(signal), []);
  const state = useBusinessResource(load, "business-admin-session"); const retry = state.retry;
  const identity = state.kind === "ready" && state.data?.role === "Admin" ? state.data.id : null;
  const identityKnown = state.kind === "ready" || (state.kind === "error" && state.error instanceof MovelyApiError && [401, 403].includes(state.error.status));
  useEffect(() => { if (identityKnown) onIdentity?.(identity); }, [identity, identityKnown, onIdentity]);
  useEffect(() => {
    let foreground = document.visibilityState === "visible" && document.hasFocus();
    const focus = () => { if (document.visibilityState === "visible" && !foreground) { foreground = true; retry(); } };
    const blur = () => { foreground = false; };
    const visibility = () => { if (document.visibilityState === "hidden") blur(); else focus(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { blur(); focus(); } };
    window.addEventListener("focus", focus); window.addEventListener("blur", blur); window.addEventListener("pageshow", restored); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("focus", focus); window.removeEventListener("blur", blur); window.removeEventListener("pageshow", restored); document.removeEventListener("visibilitychange", visibility); };
  }, [retry]);
  if (state.kind === "loading") return <p role="status">בודקים הרשאות ניהול…</p>;
  if (state.kind === "error") return <BusinessError error={state.error} retry={retry} />;
  if (state.data?.role !== "Admin") return <section className="rounded-xl bg-white p-5"><h2 className="text-xl font-bold">הגישה מיועדת למנהלי האתר</h2><Link className="button button-primary mt-4" href="/auth">כניסה לחשבון</Link></section>;
  return typeof children === "function" ? children(state.data.id) : children;
}
