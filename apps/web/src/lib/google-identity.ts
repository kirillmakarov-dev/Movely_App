type CredentialResponse = { credential: string; state?: string };
type GoogleIdentity = {
  initialize: (options: { client_id: string; callback: (response: CredentialResponse) => void; auto_select: boolean; ux_mode: string }) => void;
  renderButton: (element: HTMLElement, options: Record<string, string | number>) => void;
};
declare global { interface Window { google?: { accounts: { id: GoogleIdentity } } } }

let loading: Promise<GoogleIdentity> | null = null;
let initializedClient: string | null = null;
const handlers = new Map<string, (credential: string) => void>();

function loadGoogleIdentity(): Promise<GoogleIdentity> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id);
  if (loading) return loading;
  loading = new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      clearTimeout(timer); script.onload = null; script.onerror = null;
      script.remove(); loading = null; reject(new Error("Google sign-in could not load."));
    };
    const timer = setTimeout(fail, 15_000);
    script.src = "https://accounts.google.com/gsi/client?hl=he";
    script.async = true;
    script.onload = () => {
      if (!window.google?.accounts.id) { fail(); return; }
      clearTimeout(timer); script.onload = null; script.onerror = null;
      resolve(window.google.accounts.id);
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}

export async function mountGoogleButton(element: HTMLElement, clientId: string, onCredential: (credential: string) => void, signal?: AbortSignal) {
  const google = await loadGoogleIdentity();
  if (signal?.aborted || !element.isConnected) return () => {};
  if (initializedClient && initializedClient !== clientId) throw new Error("Sign-in configuration changed; reload after saving your draft.");
  if (!initializedClient) {
    google.initialize({ client_id: clientId, auto_select: false, ux_mode: "popup", callback: (response) => {
      if (response.state && response.credential) handlers.get(response.state)?.(response.credential);
    } });
    initializedClient = clientId;
  }
  const state = crypto.randomUUID();
  handlers.set(state, onCredential);
  let width = 0;
  const render = () => {
    const nextWidth = Math.min(400, Math.max(200, Math.floor(element.getBoundingClientRect().width)));
    if (width === nextWidth) return;
    width = nextWidth;
    element.replaceChildren();
    google.renderButton(element, { type: "standard", theme: "outline", size: "large", text: "continue_with", locale: "he",
      width, state });
  };
  try { render(); } catch (error) { handlers.delete(state); throw error; }
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(render);
  observer?.observe(element);
  window.addEventListener("resize", render);
  return () => { observer?.disconnect(); window.removeEventListener("resize", render); handlers.delete(state); element.replaceChildren(); };
}
