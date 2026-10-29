import { afterEach, beforeEach, expect, test, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

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
