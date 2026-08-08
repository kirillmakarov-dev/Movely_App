"use client";

import { useEffect, useState } from "react";
import { MOVELY_API_BASE_URL } from "../../lib/movely-api";

type CurrentUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  phoneVerified: boolean;
  role: string;
  businessStatus: string | null;
  subscriptionStatus: string | null;
  businessId: string | null;
};

type CsrfResponse = {
  requestToken: string;
};

type RequestPhoneCodeResponse = {
  normalizedPhone: string;
  debugCode: string | null;
  expiresAt: string;
};

export default function AuthPage() {
  const [csrfToken, setCsrfToken] = useState("");
  const [status, setStatus] = useState("Ready");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [googleCredential, setGoogleCredential] = useState(
    "dev-google:demo-subject:customer@example.com:Alex:Customer",
  );
  const [phone, setPhone] = useState("050-123-4567");
  const [otpCode, setOtpCode] = useState("");
  const [debugCode, setDebugCode] = useState("");

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    await refreshCsrf();
    await refreshCurrentUser();
  }

  async function refreshCsrf() {
    const response = await fetch(`${MOVELY_API_BASE_URL}/api/v1/auth/csrf`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Could not load a CSRF token.");
    }

    const payload = (await response.json()) as CsrfResponse;
    setCsrfToken(payload.requestToken);
    return payload.requestToken;
  }

  async function refreshCurrentUser() {
    const response = await fetch(`${MOVELY_API_BASE_URL}/api/v1/auth/me`, {
      credentials: "include",
    });

    if (response.ok) {
      setUser((await response.json()) as CurrentUser);
      return;
    }

    setUser(null);
  }

  async function sendJson(path: string, body: unknown) {
    const token = csrfToken || (await refreshCsrf());
    const response = await fetch(`${MOVELY_API_BASE_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-TOKEN": token,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Request failed with ${response.status}`);
    }

    return response;
  }

  async function handleGoogleSignIn() {
    try {
      setStatus("Signing in...");
      const response = await sendJson("/api/v1/auth/google/sign-in", {
        credential: googleCredential,
      });
      setUser((await response.json()) as CurrentUser);
      setStatus("Signed in with Google.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sign-in failed.");
    }
  }

  async function handleRequestCode() {
    try {
      setStatus("Requesting code...");
      const response = await sendJson("/api/v1/auth/phone/request-code", {
        phone,
      });
      const payload = (await response.json()) as RequestPhoneCodeResponse;
      setDebugCode(payload.debugCode ?? "");
      setStatus(`OTP sent to ${payload.normalizedPhone}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "OTP request failed.");
    }
  }

  async function handleVerifyCode() {
    try {
      setStatus("Verifying code...");
      await sendJson("/api/v1/auth/phone/verify-code", {
        phone,
        code: otpCode,
      });
      await refreshCurrentUser();
      setStatus("Phone verified.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Verification failed.");
    }
  }

  async function handleLogout() {
    try {
      setStatus("Logging out...");
      await sendJson("/api/v1/auth/logout", {});
      setUser(null);
      setStatus("Signed out.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Logout failed.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
      <section className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
          Movely auth foundation
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Cookie-based sign-in, phone verification, and session logout.
        </h1>
        <p className="max-w-2xl text-base leading-7 text-slate-600">
          This screen exercises the Phase 2 identity foundation: Google sign-in,
          server-managed sessions, OTP verification, and the current-user
          snapshot that the rest of the app will build on.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-950">Google sign-in</h2>
            <p className="text-sm text-slate-600">
              Use a development credential in the format{" "}
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
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700"
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
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">OTP code</span>
              <input
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-900"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRequestCode}
              className="rounded-full border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700"
            >
              Request code
            </button>
            <button
              type="button"
              onClick={handleVerifyCode}
              className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-medium text-white"
            >
              Verify code
            </button>
          </div>
          {debugCode ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Development OTP: <strong>{debugCode}</strong>
            </p>
          ) : null}
        </div>

        <aside className="space-y-4 rounded-3xl border border-slate-200 bg-slate-950 p-6 text-slate-100 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold">Current session</h2>
            <p className="mt-1 text-sm text-slate-300">{status}</p>
          </div>

          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-400">Authenticated</dt>
              <dd className="font-medium">{user ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Name</dt>
              <dd className="font-medium">
                {user ? `${user.firstName} ${user.lastName}` : "—"}
              </dd>
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
            <div>
              <dt className="text-slate-400">CSRF token</dt>
              <dd className="break-all font-mono text-xs text-slate-200">
                {csrfToken || "Loading..."}
              </dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  );
}
