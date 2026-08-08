"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  type CurrentUser,
  getCurrentUser,
  logout,
  requestPhoneCode,
  signInWithGoogle,
  verifyPhoneCode,
} from "@/lib/movely-api";

export default function AuthPage() {
  const [status, setStatus] = useState("Ready");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [googleCredential, setGoogleCredential] = useState(
    "dev-google:demo-subject:customer@example.com:Alex:Customer",
  );
  const [phone, setPhone] = useState("050-123-4567");
  const [otpCode, setOtpCode] = useState("");
  const [debugCode, setDebugCode] = useState("");

  useEffect(() => {
    void getCurrentUser().then(setUser).catch(() => setUser(null));
  }, []);

  async function handleGoogleSignIn() {
    try {
      setStatus("Signing in...");
      setUser(await signInWithGoogle(googleCredential));
      setStatus("Signed in with Google.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sign-in failed.");
    }
  }

  async function handleRequestCode() {
    try {
      setStatus("Requesting code...");
      const payload = await requestPhoneCode(phone);
      setDebugCode(payload.debugCode ?? "");
      setStatus(`OTP sent to ${payload.normalizedPhone}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "OTP request failed.");
    }
  }

  async function handleVerifyCode() {
    try {
      setStatus("Verifying code...");
      const response = await verifyPhoneCode(phone, otpCode);
      setUser((current) =>
        current
          ? {
              ...current,
              phone: response.normalizedPhone,
              phoneVerified: response.phoneVerified,
            }
          : current,
      );
      setStatus("Phone verified.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Verification failed.");
    }
  }

  async function handleLogout() {
    try {
      setStatus("Logging out...");
      await logout();
      setUser(null);
      setStatus("Signed out.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Logout failed.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_28px_90px_rgba(30,58,138,0.08)] backdrop-blur-xl">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
          Movely auth foundation
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          Sign in, verify the phone, and keep the session server-managed.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          This page uses the same auth flow that the request wizard relies on before publish.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to wizard
          </Link>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6 rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_28px_90px_rgba(30,58,138,0.08)] backdrop-blur-xl">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-950">Google sign-in</h2>
            <p className="text-sm text-slate-600">
              Use the development credential format{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5">
                dev-google:subject:email:first:last
              </code>
              .
            </p>
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">Credential</span>
            <input
              value={googleCredential}
              onChange={(event) => setGoogleCredential(event.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 cursor-pointer"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
            >
              Log out
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">Phone</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">OTP code</span>
              <input
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRequestCode}
              className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
            >
              Request code
            </button>
            <button
              type="button"
              onClick={handleVerifyCode}
              className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 cursor-pointer"
            >
              Verify code
            </button>
          </div>
          {debugCode ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
              Development OTP: <strong>{debugCode}</strong>
            </p>
          ) : null}
          <p className="text-sm text-slate-500">{status}</p>
        </div>

        <aside className="space-y-4 rounded-[32px] border border-white/70 bg-slate-950 p-6 text-slate-100 shadow-[0_28px_90px_rgba(30,58,138,0.08)]">
          <h2 className="text-lg font-semibold">Current session</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-400">Authenticated</dt>
              <dd className="font-medium">{user ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Name</dt>
              <dd className="font-medium">{user ? `${user.firstName} ${user.lastName}` : "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Email</dt>
              <dd className="font-medium">{user?.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Phone verified</dt>
              <dd className="font-medium">{user?.phoneVerified ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Role</dt>
              <dd className="font-medium">{user?.role ?? "—"}</dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  );
}
