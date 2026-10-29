"use client";
import { useCallback, useEffect } from "react";
import Link from "@/components/SafeLink";
import { getCurrentUser } from "@/lib/movely-api";
import { getMyBusiness } from "@/lib/business-api";
import { BusinessError, businessStatusLabels, useBusinessResource } from "./business-ui";
export default function BusinessHome() {
  const load = useCallback(async (signal: AbortSignal) => { const user = await getCurrentUser(signal); return { user, profile: user && user.role !== "Admin" ? await getMyBusiness(signal) : null }; }, []);
  const state = useBusinessResource(load, "business-home");
  const retry = state.retry;
  useEffect(() => {
    let foreground = document.visibilityState === "visible" && document.hasFocus();
    const refresh = () => { if (document.visibilityState === "visible" && !foreground) { foreground = true; retry(); } };
    const blur = () => { foreground = false; };
    const visibility = () => { if (document.visibilityState === "hidden") blur(); else refresh(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { blur(); refresh(); } };
    window.addEventListener("focus", refresh); window.addEventListener("blur", blur); window.addEventListener("pageshow", restored); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("blur", blur); window.removeEventListener("pageshow", restored); document.removeEventListener("visibilitychange", visibility); };
  }, [retry]);
  if (state.kind === "loading") return <p role="status">טוענים את מצב העסק…</p>;
  if (state.kind === "error") return <BusinessError error={state.error} retry={state.retry} />;
  return <section className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-bold">{state.data.profile?.name || "מתחילים עם הפרופיל העסקי"}</h2><p className="mt-3 leading-7">{state.data.profile ? `מצב העסק: ${businessStatusLabels[state.data.profile.status]}. אפשר לראות את פרטי העסק ואת הודעות צוות הבדיקה בפרופיל.` : "צרו פרופיל עסקי, השלימו את פרטי החשבון ושלחו לבדיקה ידנית. הגישה לקטלוג נפתחת לאחר אישור העסק."}</p><div className="mt-5 flex flex-wrap gap-3"><Link href={state.data.user?.role === "Admin" ? "/admin/businesses" : "/mover/profile"} className="button button-primary">{state.data.user?.role === "Admin" ? "בדיקת עסקים" : "ניהול הפרופיל העסקי"}</Link><Link href="/mover/requests" className="button button-secondary">קטלוג בקשות הובלה</Link>{state.data.user?.role === "Customer" ? <Link href="/account/requests" className="button button-secondary">בקשות ההובלה שלי</Link> : null}</div><p className="mt-5 leading-7 text-slate-600">פרטי קשר, רכישת לידים והצעות ללקוחות אינם זמינים כרגע. הקטלוג מציג פרטי הובלה ללא פרטי קשר או כתובות מדויקות.</p></section>;
}
