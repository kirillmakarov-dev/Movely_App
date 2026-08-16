"use client";

import Link from "@/components/SafeLink";
import { useEffect, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import {
  type CurrentUser,
  getCurrentUser,
  logout,
  requestPhoneCode,
  signInWithGoogle,
  verifyPhoneCode,
} from "@/lib/movely-api";

const developmentCredential = "dev-google:demo-subject:customer@example.com:Alex:Customer";

export default function AuthPage() {
  const [status, setStatus] = useState("התחברו כדי להמשיך את הבקשה שלכם.");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [phone, setPhone] = useState("050-123-4567");
  const [otpCode, setOtpCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getCurrentUser().then(setUser).catch(() => setUser(null));
  }, []);

  async function handleGoogleSignIn() {
    try {
      setBusy(true);
      setStatus("מתחברים...");
      setUser(await signInWithGoogle(developmentCredential));
      setStatus("ההתחברות הצליחה.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "ההתחברות נכשלה. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestCode() {
    try {
      setBusy(true);
      setStatus("שולחים קוד אימות...");
      const payload = await requestPhoneCode(phone);
      if (payload.debugCode) setOtpCode(payload.debugCode);
      setStatus(`קוד האימות נשלח אל ${payload.normalizedPhone}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "לא הצלחנו לשלוח קוד. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode() {
    try {
      setBusy(true);
      setStatus("בודקים את הקוד...");
      const response = await verifyPhoneCode(phone, otpCode);
      setUser((current) => current ? { ...current, phone: response.normalizedPhone, phoneVerified: response.phoneVerified } : current);
      setStatus("הטלפון אומת. אפשר כעת לפרסם בקשות.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "האימות נכשל. בדקו את הקוד ונסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    try {
      setBusy(true);
      await logout();
      setUser(null);
      setStatus("יצאתם מהמערכת.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "לא הצלחנו לנתק אתכם.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="site-container py-10 sm:py-16">
        <div className="mx-auto grid max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[.85fr_1.15fr]">
          <section className="bg-slate-950 p-7 text-white sm:p-10">
            <p className="eyebrow text-sky-300">חשבון Movely</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">כל ההובלות שלכם במקום אחד.</h1>
            <p className="mt-5 leading-7 text-slate-300">התחברו כדי לשמור טיוטות, להמשיך בקשה ולהפרסם לאחר אימות הטלפון.</p>
            <Link href="/" className="mt-10 inline-flex min-h-11 items-center font-bold text-sky-300 hover:text-white">&larr; חזרה לדף הבית</Link>
          </section>

          <section className="p-6 sm:p-10">
            {user ? (
              <div>
                <p className="text-sm font-bold text-sky-800">מחוברים</p>
                <h2 className="mt-2 text-2xl font-bold">ברוכים הבאים, {user.firstName}</h2>
                <p className="mt-2 text-slate-600">{user.phoneVerified ? "הטלפון שלכם מאומת." : "אמתו את הטלפון לפני פרסום הבקשה."}</p>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-bold">התחברות</h2>
                <p className="mt-2 text-slate-600">המשיכו עם Google כדי לגשת לחשבון הלקוח שלכם.</p>
                <button type="button" onClick={handleGoogleSignIn} disabled={busy} className="button button-primary mt-6 w-full disabled:opacity-60">המשך עם Google</button>
              </div>
            )}

            {user && !user.phoneVerified ? (
              <div className="mt-8 border-t border-slate-200 pt-7">
                <h2 className="text-xl font-bold">אימות טלפון</h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="field-label">מספר טלפון<input className="field-control" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
                  <label className="field-label">קוד אימות<input className="field-control" inputMode="numeric" autoComplete="one-time-code" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} /></label>
                </div>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button type="button" onClick={handleRequestCode} disabled={busy} className="button button-secondary">שליחת קוד</button>
                  <button type="button" onClick={handleVerifyCode} disabled={busy || !otpCode} className="button button-primary disabled:cursor-not-allowed disabled:opacity-50">אימות טלפון</button>
                </div>
              </div>
            ) : null}

            {user ? (
              <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row">
                <Link href="/account/requests" className="button button-primary">מעבר לבקשות שלי</Link>
                <button type="button" onClick={handleLogout} disabled={busy} className="button button-ghost">יציאה</button>
              </div>
            ) : null}
          <p className="mt-6 text-sm text-slate-500" aria-live="polite">{status}</p>
          </section>
        </div>
      </main>
    </>
  );
}
