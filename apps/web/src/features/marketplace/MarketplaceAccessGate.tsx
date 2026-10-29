"use client";
import { useCallback, useEffect, type ReactNode } from "react";
import Link from "@/components/SafeLink";
import { getCurrentUser, MovelyApiError } from "@/lib/movely-api";
import useMarketplaceResource from "./useMarketplaceResource";
export function MarketplaceError({ error, retry }: { error: unknown; retry: () => void }) {
  const status = error instanceof MovelyApiError ? error.status : 0;
  const code = error instanceof MovelyApiError ? error.errorCode : "";
  const title = code === "POLICY_ACCEPTANCE_REQUIRED" ? "נדרש אישור התנאים המעודכנים" : status === 401 ? "התחברו כדי לצפות בבקשות" : status === 403 ? "הגישה לבקשות אינה זמינה בחשבון הזה" : status === 404 ? "הבקשה אינה זמינה" : status === 429 ? "יש להמתין לפני ניסיון נוסף" : code === "LEGAL_NOT_READY" ? "הצפייה בבקשות עדיין אינה פתוחה" : status === 503 ? "שירות הבקשות אינו זמין כרגע" : code === "MARKETPLACE_TIMEOUT" ? "הטעינה נמשכת זמן רב מדי" : "לא הצלחנו לטעון את הבקשות";
  return <section role="alert" className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-bold">{title}</h2><p className="mt-3 leading-7 text-slate-700">{code === "POLICY_ACCEPTANCE_REQUIRED" ? "קראו את התנאים ואת הודעת הפרטיות המעודכנים ואשרו אותם בחשבון לפני צפייה בבקשות." : status === 404 ? "ייתכן שהבקשה נסגרה או שאינה זמינה לצפייה. אפשר לחזור לרשימת הבקשות." : status === 429 ? "נסו שוב בעוד זמן קצר. אין צורך לשלוח שוב ושוב את אותה בקשה." : status === 401 || status === 403 ? "הצפייה מיועדת לחשבון מוביל עם עסק מאומת. בדקו שאתם מחוברים לחשבון המתאים." : "אפשר לבדוק את החיבור ולנסות שוב מאוחר יותר."}</p><div className="mt-5 flex flex-wrap gap-3">{status === 401 || status === 403 ? <Link href="/auth" className="button button-primary">כניסה לחשבון</Link> : null}<button className="button button-secondary" type="button" onClick={retry}>ניסיון נוסף</button></div></section>;
}
export default function MarketplaceAccessGate({ children }: { children: ReactNode }) {
  const load = useCallback((signal: AbortSignal) => getCurrentUser(signal), []);
  const state = useMarketplaceResource(load, "marketplace-session");
  const retry = state.retry;
  useEffect(() => {
    // A tab return commonly emits both visibilitychange and focus. Recheck once
    // per foreground edge; a later blur/hidden transition arms the next check.
    let foreground = document.visibilityState === "visible" && document.hasFocus();
    const refresh = (force = false) => {
      if (document.visibilityState !== "visible" || (foreground && !force)) return;
      foreground = true;
      retry();
    };
    const focused = () => refresh();
    const blurred = () => { foreground = false; };
    const visibilityChanged = () => {
      if (document.visibilityState === "hidden") foreground = false;
      else refresh();
    };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) refresh(true); };
    window.addEventListener("focus", focused);
    window.addEventListener("blur", blurred);
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pageshow", restored);
    return () => {
      window.removeEventListener("focus", focused);
      window.removeEventListener("blur", blurred);
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("pageshow", restored);
    };
  }, [retry]);
  if (state.kind === "loading") return <p role="status" className="rounded-xl border border-slate-200 bg-white p-6">בודקים את הגישה לבקשות…</p>;
  if (state.kind === "error") return <MarketplaceError error={state.error} retry={state.retry} />;
  const user = state.data;
  if (user?.role === "Mover" && user.businessId && user.businessStatus === "Verified") {
    if (user.hasCurrentPolicyAcceptance) return children;
    return <section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-bold">נדרש אישור התנאים המעודכנים</h2><p className="mt-3 leading-7">קראו את התנאים ואת הודעת הפרטיות ואשרו אותם בחשבון לפני צפייה בבקשות.</p><Link href="/auth" className="button button-primary mt-5">קריאת התנאים בחשבון</Link></section>;
  }
  const title = !user ? "התחברו כדי לצפות בבקשות" : user.role !== "Mover" ? "הבקשות מיועדות למובילים עם עסק מאומת" : !user.businessId ? "עדיין אין עסק משויך לחשבון" : user.businessStatus === "PendingVerification" ? "העסק עדיין ממתין לאימות" : user.businessStatus === "Suspended" ? "הגישה של העסק מוגבלת כרגע" : user.businessStatus === "Rejected" ? "העסק אינו מאושר לצפייה בבקשות" : "אימות העסק נדרש לצפייה בבקשות";
  return <section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-bold">{title}</h2><p className="mt-3 leading-7 text-slate-700">הצפייה זמינה למובילים שהעסק שלהם אומת. חשבון לקוח משמש ליצירה ולניהול של בקשות ההובלה שלכם.</p><div className="mt-5 flex flex-wrap gap-3">{user?.role === "Customer" ? <Link href="/account/requests" className="button button-primary">הבקשות שלי</Link> : <Link href="/auth" className="button button-primary">כניסה לחשבון</Link>}<button type="button" className="button button-secondary" onClick={state.retry}>בדיקת הגישה מחדש</button></div></section>;
}
