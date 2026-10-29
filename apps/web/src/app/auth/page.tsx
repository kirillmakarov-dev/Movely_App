"use client";

import Link from "@/components/SafeLink";
import { useEffect, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import AccountSignIn from "@/components/AccountSignIn";
import PhoneVerification from "@/components/PhoneVerification";
import { type CurrentUser, getCurrentUser, logout } from "@/lib/movely-api";

export default function AuthPage() {
  const [status, setStatus] = useState("");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const failure = () => {
      setSessionCheckFailed(true); setChecking(false);
      setStatus("לא הצלחנו לבדוק אם אתם מחוברים. בדקו את החיבור ונסו שוב.");
    };
    const timeout = setTimeout(() => { controller.abort(); if (active) failure(); }, 10_000);
    void getCurrentUser(controller.signal).then((value) => { if (active && !controller.signal.aborted) setUser(value); })
      .catch(() => { if (active && !controller.signal.aborted) failure(); })
      .finally(() => { clearTimeout(timeout); if (active) setChecking(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [sessionAttempt]);

  async function handleLogout() {
    setBusy(true);
    try { await logout(); setUser(null); setStatus("יצאתם מהחשבון."); }
    catch { setStatus("לא הצלחנו לנתק אתכם. נסו שוב לפני סגירת הדף במחשב משותף."); }
    finally { setBusy(false); }
  }

  return <>
    <SiteHeader />
    <main id="main-content" className="site-container py-8 sm:py-16">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[.85fr_1.15fr]">
        <section className="min-w-0 bg-slate-950 p-6 text-white sm:p-10">
          <p className="eyebrow text-sky-300">חשבון Movely</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">ממשיכים מכאן.</h1>
          <p className="mt-4 text-base leading-7 text-slate-200">החשבון מאפשר לשמור טיוטות ולנהל בקשות. לפני פרסום מאמתים גם את הטלפון.</p>
          <p className="mt-4 text-base leading-7 text-slate-200">אפשר להתחיל לתאר את ההובלה גם בלי חשבון.</p>
          <Link href="/request/new" className="mt-5 inline-flex min-h-12 items-center font-semibold text-sky-200 underline">הכנת בקשה בלי להתחבר</Link>
        </section>
        <section className="min-w-0 space-y-6 p-5 sm:p-10" aria-label="כניסה לחשבון">
          {checking ? <p role="status">בודקים אם אתם מחוברים…</p> : user ? <>
            <div>
              <p className="font-semibold text-sky-800">מחוברים</p>
              <h2 className="mt-2 text-2xl font-bold">ברוכים הבאים, {user.firstName}</h2>
              <p className="mt-3 text-base leading-7">{user.phoneVerified ? "הטלפון שלכם מאומת." : "אמתו את הטלפון לפני פרסום הבקשה."}</p>
            </div>
            {!user.phoneVerified && <section className="space-y-4 border-t border-slate-200 pt-5" aria-label="אימות טלפון">
              <h2 className="text-xl font-bold">אימות טלפון</h2>
              <PhoneVerification key={user.id} initialPhone={user.phone ?? ""} disabled={busy} onBusyChange={setBusy}
                onVerified={(result) => { setUser((current) => current ? { ...current, phone: result.normalizedPhone, phoneVerified: result.phoneVerified } : current); setStatus("הטלפון אומת."); }} />
            </section>}
            <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:flex-wrap">
              <Link href="/account/requests" className="button button-primary">מעבר לבקשות שלי</Link>
              <button type="button" disabled={busy} onClick={handleLogout} className="button button-secondary">יציאה</button>
            </div>
          </> : <>
            <h2 className="text-2xl font-bold">כניסה או הרשמה</h2>
            <AccountSignIn onBusyChange={setBusy} onSignedIn={(signedIn) => { setUser(signedIn); setSessionCheckFailed(false); setStatus("ההתחברות הצליחה."); }} />
          </>}
          {status && <p role="status" className="text-base leading-7 text-slate-700">{status}</p>}
          {sessionCheckFailed && <button type="button" disabled={busy} className="button button-secondary" onClick={() => {
            setSessionCheckFailed(false); setChecking(true); setStatus(""); setSessionAttempt((attempt) => attempt + 1);
          }}>בדיקת החיבור מחדש</button>}
        </section>
      </div>
    </main>
  </>;
}
