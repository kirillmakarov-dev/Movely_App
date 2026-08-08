"use client";

import Link from "next/link";
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
  const [status, setStatus] = useState("Sign in to continue your request.");
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
      setStatus("Signing in...");
      setUser(await signInWithGoogle(developmentCredential));
      setStatus("You are signed in.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestCode() {
    try {
      setBusy(true);
      setStatus("Sending verification code...");
      const payload = await requestPhoneCode(phone);
      if (payload.debugCode) setOtpCode(payload.debugCode);
      setStatus(`Verification code sent to ${payload.normalizedPhone}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send a code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode() {
    try {
      setBusy(true);
      setStatus("Checking your code...");
      const response = await verifyPhoneCode(phone, otpCode);
      setUser((current) => current ? { ...current, phone: response.normalizedPhone, phoneVerified: response.phoneVerified } : current);
      setStatus("Phone verified. You can now publish requests.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Verification failed. Check the code and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    try {
      setBusy(true);
      await logout();
      setUser(null);
      setStatus("You are signed out.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not sign out.");
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
            <p className="eyebrow text-sky-300">Movely account</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Your moves, saved in one place.</h1>
            <p className="mt-5 leading-7 text-slate-300">Sign in to save drafts, resume a request and publish after phone verification.</p>
            <Link href="/" className="mt-10 inline-flex min-h-11 items-center font-bold text-sky-300 hover:text-white">&larr; Back to home</Link>
          </section>

          <section className="p-6 sm:p-10">
            {user ? (
              <div>
                <p className="text-sm font-bold text-sky-800">Signed in</p>
                <h2 className="mt-2 text-2xl font-bold">Welcome, {user.firstName}</h2>
                <p className="mt-2 text-slate-600">{user.phoneVerified ? "Your phone is verified." : "Verify your phone before publishing a request."}</p>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-bold">Login</h2>
                <p className="mt-2 text-slate-600">Continue with Google to access your customer account.</p>
                <button type="button" onClick={handleGoogleSignIn} disabled={busy} className="button button-primary mt-6 w-full disabled:opacity-60">Continue with Google</button>
              </div>
            )}

            {user && !user.phoneVerified ? (
              <div className="mt-8 border-t border-slate-200 pt-7">
                <h2 className="text-xl font-bold">Verify your phone</h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="field-label">Phone number<input className="field-control" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
                  <label className="field-label">Verification code<input className="field-control" inputMode="numeric" autoComplete="one-time-code" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} /></label>
                </div>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button type="button" onClick={handleRequestCode} disabled={busy} className="button button-secondary">Send code</button>
                  <button type="button" onClick={handleVerifyCode} disabled={busy || !otpCode} className="button button-primary disabled:cursor-not-allowed disabled:opacity-50">Verify phone</button>
                </div>
              </div>
            ) : null}

            {user ? (
              <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row">
                <Link href="/account/requests" className="button button-primary">Go to My Requests</Link>
                <button type="button" onClick={handleLogout} disabled={busy} className="button button-ghost">Log out</button>
              </div>
            ) : null}
            <p className="mt-6 text-sm text-slate-500" aria-live="polite">{status}</p>
          </section>
        </div>
      </main>
    </>
  );
}
