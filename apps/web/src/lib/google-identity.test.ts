import { beforeEach, afterEach, expect, test, vi } from "vitest";

beforeEach(() => { vi.resetModules(); delete window.google; document.body.replaceChildren(); });
afterEach(() => { delete window.google; document.querySelectorAll('script[src*="accounts.google.com"]').forEach((script) => script.remove()); vi.useRealTimers(); vi.restoreAllMocks(); });
const element = () => { const node = document.createElement("div"); document.body.appendChild(node); return node; };

test("a stalled Google script times out and removes itself", async () => {
  vi.useFakeTimers();
  const { mountGoogleButton } = await import("./google-identity");
  const pending = mountGoogleButton(element(), "client", vi.fn());
  const rejected = expect(pending).rejects.toThrow("Google sign-in could not load");
  await vi.advanceTimersByTimeAsync(15_000);
  await rejected;
  expect(document.querySelector('script[src*="accounts.google.com"]')).toBeNull();
});

test("one initializer routes credentials only to the corresponding live button", async () => {
  let callback!: (value: { credential: string; state?: string }) => void;
  const initialize = vi.fn((options) => { callback = options.callback; });
  const renderButton = vi.fn();
  window.google = { accounts: { id: { initialize, renderButton } } };
  const { mountGoogleButton } = await import("./google-identity");
  const first = vi.fn(); const second = vi.fn();
  const cleanup = await mountGoogleButton(element(), "client", first);
  const cleanupOther = await mountGoogleButton(element(), "client", second);
  expect(initialize).toHaveBeenCalledOnce();
  expect(initialize.mock.calls[0][0]).toMatchObject({ auto_select: false, ux_mode: "popup" });
  const state = renderButton.mock.calls[0][1].state;
  const otherState = renderButton.mock.calls[1][1].state;
  callback({ credential: "token", state });
  expect(first).toHaveBeenCalledExactlyOnceWith("token");
  expect(second).not.toHaveBeenCalled();
  cleanup();
  callback({ credential: "stale", state });
  callback({ credential: "no-state" });
  callback({ credential: "token-2", state: otherState });
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledExactlyOnceWith("token-2");
  cleanupOther();
});

test("shares a single script, ignores aborted mounts, and permits retry after loading failure", async () => {
  const { mountGoogleButton } = await import("./google-identity");
  const controller = new AbortController();
  const first = mountGoogleButton(element(), "client", vi.fn(), controller.signal);
  const second = mountGoogleButton(element(), "client", vi.fn());
  const failures = Promise.allSettled([first, second]);
  expect(document.querySelectorAll('script[src*="accounts.google.com"]')).toHaveLength(1);
  document.querySelector('script[src*="accounts.google.com"]')!.dispatchEvent(new Event("error"));
  expect((await failures).every((result) => result.status === "rejected")).toBe(true);
  const pending = mountGoogleButton(element(), "client", vi.fn(), controller.signal);
  controller.abort();
  const initialize = vi.fn(); const renderButton = vi.fn();
  window.google = { accounts: { id: { initialize, renderButton } } };
  document.querySelector('script[src*="accounts.google.com"]')!.dispatchEvent(new Event("load"));
  (await pending)();
  expect(initialize).not.toHaveBeenCalled();
  expect(renderButton).not.toHaveBeenCalled();
});

test("responsive button follows container width and unregisters resize on disposal", async () => {
  const renderButton = vi.fn();
  window.google = { accounts: { id: { initialize: vi.fn(), renderButton } } };
  const node = element(); let width = 360;
  vi.spyOn(node, "getBoundingClientRect").mockImplementation(() => ({ width }) as DOMRect);
  const { mountGoogleButton } = await import("./google-identity");
  const cleanup = await mountGoogleButton(node, "client", vi.fn());
  expect(renderButton.mock.calls[0][1].width).toBe(360);
  width = 220; window.dispatchEvent(new Event("resize"));
  expect(renderButton.mock.calls[1][1].width).toBe(220);
  cleanup(); width = 300; window.dispatchEvent(new Event("resize"));
  expect(renderButton).toHaveBeenCalledTimes(2);
});
