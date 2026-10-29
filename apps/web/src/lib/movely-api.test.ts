import { afterEach, beforeEach, expect, test, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

test("locality suggestions use the fixed endpoint, preserve the caller's signal, and expose only public fields", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
  const fetchMock = vi.fn().mockResolvedValue(json([{ code: "7", name: "שחר", url: "https://unexpected.example/data" }, { code: "3000", name: "ירושלים" }, { code: "5000", name: 'תל אביב - יפו' }]));
  vi.stubGlobal("fetch", fetchMock);
  const api = await import("./movely-api");
  const controller = new AbortController();
  await expect(api.getLocalities(controller.signal)).resolves.toEqual([
    { code: "7", name: "שחר" }, { code: "3000", name: "ירושלים" }, { code: "5000", name: "תל אביב - יפו" },
  ]);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://api.example.com/api/v1/localities", expect.objectContaining({ method: "GET", signal: controller.signal, cache: "no-store" }));
});

test.each([
  null, {}, [], [null], [{ code: 3000, name: "ירושלים" }], [{ code: "0", name: "ירושלים" }],
  [{ code: "03000", name: "ירושלים" }], [{ code: "3000/path", name: "ירושלים" }],
  [{ code: "3000", name: "" }], [{ code: "3000", name: " עיר " }], [{ code: "3000", name: "א".repeat(121) }],
  [{ code: "3000", name: "עיר\nאחרת" }], [{ code: "3000", name: "עיר\u202e" }],
  [{ code: "3000", name: "ירושלים" }, { code: "3000", name: "שם אחר" }],
])("rejects malformed locality data without a partial fallback: %j", async (payload) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(payload)));
  const api = await import("./movely-api");
  await expect(api.getLocalities()).rejects.toMatchObject({ errorCode: "LOCALITIES_INVALID_RESPONSE" });
});

test("an HTML deployment fallback is not a list of localities", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>app</html>", { headers: { "Content-Type": "text/html" } })));
  const api = await import("./movely-api");
  await expect(api.getLocalities()).rejects.toMatchObject({ errorCode: "LOCALITIES_INVALID_RESPONSE" });
});

test("request version conflicts explain how to retain unsaved edits without exposing server details", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/csrf") ? json({ requestToken: "token" }) : json({ errorCode: "REQUEST_VERSION_CONFLICT", message: "private database details" }, 409)));
  const api = await import("./movely-api");
  await expect(api.publishMoveRequest("request", { shareContacts: true, disclosureVersion: "v1", maxRecipients: 3 })).rejects.toMatchObject({
    status: 409, errorCode: "REQUEST_VERSION_CONFLICT", message: "הבקשה השתנתה מאז שנפתחה. שמרו עותק של השינויים שלא נשמרו ורעננו את הבקשה לפני ניסיון נוסף.",
  });
});

test("production uses same-origin API by default, never the visitor's localhost", async () => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
  const fetchMock = vi.fn().mockResolvedValue(json({ policyAcceptanceAvailable: false, googleSignInAvailable: false, googleClientId: null, phoneVerificationAvailable: false }));
  vi.stubGlobal("fetch", fetchMock);
  const api = await import("./movely-api");
  await api.getAuthCapabilities();
  expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/auth/capabilities");
});

test("configured API trims whitespace and trailing slash", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", " https://api.example.com/ ");
  const api = await import("./movely-api");
  expect(api.MOVELY_API_BASE_URL).toBe("https://api.example.com");
});

test("HTML fallback cannot masquerade as authentication capability data", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>fallback</html>", { headers: { "Content-Type": "text/html" } })));
  const api = await import("./movely-api");
  await expect(api.getAuthCapabilities()).rejects.toThrow("Invalid authentication capabilities response");
});

test("refreshes identity-bound CSRF after sign-in and after logout", async () => {
  let signedIn = false;
  let issued = 0;
  const used: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/csrf")) { issued++; return json({ requestToken: signedIn ? "signed-in" : "anonymous" }); }
    const token = new Headers(init.headers).get("X-CSRF-TOKEN");
    expect(token).toBe(signedIn ? "signed-in" : "anonymous");
    used.push(token!);
    expect(init.credentials).toBe("include");
    if (url.endsWith("/google/sign-in")) { signedIn = true; return json({ id: "user" }); }
    if (url.endsWith("/logout")) { signedIn = false; return new Response(null, { status: 204 }); }
    return json({});
  }));
  const api = await import("./movely-api");
  await api.signInWithGoogle("credential");
  await api.requestPhoneCode("0501234567");
  await api.logout();
  await api.signInWithGoogle("credential");
  expect(used).toEqual(["anonymous", "signed-in", "signed-in", "anonymous"]);
  expect(issued).toBe(4);
});

test.each(["signInWithGoogle", "logout"] as const)("invalidates cached CSRF when %s loses its response", async (operation) => {
  let issued = 0;
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/csrf")) return json({ requestToken: `token-${++issued}` });
    if (url.endsWith("/google/sign-in") || url.endsWith("/logout")) throw new TypeError("Network response lost");
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  const api = await import("./movely-api");
  await expect(operation === "logout" ? api.logout() : api.signInWithGoogle("credential")).rejects.toThrow("Network response lost");
  await api.requestPhoneCode("0501234567");
  expect(issued).toBe(2);
});

test("expired session clears the cached identity token before the next login", async () => {
  let issued = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/csrf")) return json({ requestToken: `token-${++issued}` });
    if (url.endsWith("/me")) return json({}, 401);
    return json({});
  }));
  const api = await import("./movely-api");
  await api.requestPhoneCode("0501234567");
  expect(await api.getCurrentUser()).toBeNull();
  await api.signInWithGoogle("credential");
  expect(issued).toBe(2);
});

test("provider failures use a customer-facing Hebrew message", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/csrf")
    ? json({ requestToken: "token" })
    : json({ errorCode: "AUTH_PROVIDER_UNAVAILABLE", message: "Internal provider message" }, 503)));
  const api = await import("./movely-api");
  await expect(api.signInWithGoogle("credential")).rejects.toMatchObject({
    errorCode: "AUTH_PROVIDER_UNAVAILABLE", status: 503, message: "שירות הכניסה אינו זמין כרגע. נסו שוב בעוד כמה דקות.",
  });
});

type Api = typeof import("./movely-api");
const authOperations = [
  ["sign-in", (api: Api) => api.signInWithGoogle("private-credential")],
  ["request code", (api: Api) => api.requestPhoneCode("0501234567")],
  ["verify code", (api: Api) => api.verifyPhoneCode("0501234567", "123456")],
  ["logout", (api: Api) => api.logout()],
  ["accept policies", (api: Api) => api.acceptPolicies({ adultConfirmed: true, acceptTerms: true, termsVersion: "v1", privacyVersion: "v1" })],
] as const;

function waitUntilAborted(init: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init.signal!;
    const abort = () => reject(new DOMException("Sensitive network context", "AbortError"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

for (const phase of ["csrf", "mutation"] as const) {
  test.each(authOperations)(`%s times out during ${phase} without leaking details or retrying`, async (_name, operation) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (phase === "mutation" && url.endsWith("/csrf")) return json({ requestToken: "private-csrf" });
      return waitUntilAborted(init);
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await import("./movely-api");
    const result = operation(api);
    const rejected = expect(result).rejects.toMatchObject({
      name: "MovelyApiError", errorCode: "AUTH_REQUEST_TIMEOUT", status: 0,
      message: "לא התקבלה תשובה בזמן. בדקו את החיבור ונסו שוב.",
    });
    await vi.advanceTimersByTimeAsync(19_999);
    const signal = fetchMock.mock.calls[0][1].signal!;
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(signal.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(phase === "csrf" ? 1 : 2);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.signal).toBe(signal);
      expect(init.credentials).toBe("include");
    }
    expect(vi.getTimerCount()).toBe(0);
  });
}

test("CSRF and mutation share one 20-second deadline", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/csrf")) {
      await new Promise((resolve) => setTimeout(resolve, 12_000));
      return json({ requestToken: "token" });
    }
    return waitUntilAborted(init);
  });
  vi.stubGlobal("fetch", fetchMock);
  const api = await import("./movely-api");
  const result = api.requestPhoneCode("0501234567");
  const rejected = expect(result).rejects.toMatchObject({ errorCode: "AUTH_REQUEST_TIMEOUT" });
  await vi.advanceTimersByTimeAsync(12_000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][1].signal).toBe(fetchMock.mock.calls[0][1].signal);
  await vi.advanceTimersByTimeAsync(7_999);
  expect(fetchMock.mock.calls[1][1].signal!.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await rejected;
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test.each(["signInWithGoogle", "logout"] as const)("%s timeout still invalidates identity-bound CSRF", async (operation) => {
  vi.useFakeTimers();
  let issued = 0;
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/csrf")) return json({ requestToken: `token-${++issued}` });
    if (url.endsWith("/google/sign-in") || url.endsWith("/logout")) return waitUntilAborted(init);
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  const api = await import("./movely-api");
  const result = operation === "logout" ? api.logout() : api.signInWithGoogle("credential");
  const rejected = expect(result).rejects.toMatchObject({ errorCode: "AUTH_REQUEST_TIMEOUT" });
  await vi.advanceTimersByTimeAsync(20_000);
  await rejected;
  await api.requestPhoneCode("0501234567");
  expect(issued).toBe(2);
  expect(new Headers(fetchMock.mock.lastCall![1].headers).get("X-CSRF-TOKEN")).toBe("token-2");
  expect(vi.getTimerCount()).toBe(0);
});

test.each([200, 503])("clears the deadline after an immediate HTTP %s response", async (status) => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/csrf")
    ? json({ requestToken: "token" }) : json({}, status)));
  const api = await import("./movely-api");
  const result = api.requestPhoneCode("0501234567");
  if (status === 200) await expect(result).resolves.toEqual({});
  else await expect(result).rejects.toMatchObject({ status: 503, errorCode: "HTTP_ERROR" });
  expect(vi.getTimerCount()).toBe(0);
});

test("owner reads forward cancellation and encode identifiers", async () => {
  const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => json({}));
  vi.stubGlobal("fetch", fetchMock);
  const api = await import("./movely-api");
  const controller = new AbortController();
  await api.getMyMoveRequests(controller.signal);
  await api.getMoveRequest("id/with?path", controller.signal);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][0]).toContain("/move-requests/id%2Fwith%3Fpath");
  for (const [, init] of fetchMock.mock.calls) { expect(init.signal).toBe(controller.signal); expect(init.cache).toBe("no-store"); expect(init.credentials).toBe("include"); }
});

test.each(["closeMoveRequest", "cancelMoveRequest"] as const)("%s uses CSRF; timeout does not retry", async (operation) => {
  vi.useFakeTimers();
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => url.endsWith("/csrf") ? json({ requestToken: "owner-token" }) : waitUntilAborted(init));
  vi.stubGlobal("fetch", fetchMock);
  const api = await import("./movely-api");
  const pending = api[operation]("owner-id");
  const rejected = expect(pending).rejects.toMatchObject({ errorCode: "REQUEST_ACTION_TIMEOUT", status: 0 });
  await vi.advanceTimersByTimeAsync(20_000);
  await rejected;
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const [url, init] = fetchMock.mock.calls[1];
  expect(url).toContain(`/move-requests/owner-id/${operation === "closeMoveRequest" ? "close" : "cancel"}`);
  expect(init.method).toBe("POST");
  expect(new Headers(init.headers).get("X-CSRF-TOKEN")).toBe("owner-token");
  expect(init.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test("does not add auth timeout behavior to move-request mutations", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (url) =>
    url.endsWith("/csrf") ? json({ requestToken: "token" }) : json({ id: "draft" }));
  vi.stubGlobal("fetch", fetchMock);
  const api = await import("./movely-api");
  await expect(api.createMoveRequest("SmallMove")).resolves.toEqual({ id: "draft" });
  for (const [, init] of fetchMock.mock.calls) expect(init.signal).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});
