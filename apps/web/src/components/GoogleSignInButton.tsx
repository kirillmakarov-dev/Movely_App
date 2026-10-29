"use client";

import { useEffect, useRef, useState } from "react";
import { mountGoogleButton } from "@/lib/google-identity";

export default function GoogleSignInButton({ clientId, onCredential }: { clientId: string; onCredential: (credential: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => { callback.current = onCredential; }, [onCredential]);
  useEffect(() => {
    if (!container.current) return;
    let active = true;
    const controller = new AbortController();
    let dispose: (() => void) | undefined;
    void mountGoogleButton(container.current, clientId, (credential) => { if (active) callback.current(credential); }, controller.signal)
      .then((cleanup) => { dispose = cleanup; if (!active) cleanup(); else setStatus("ready"); })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; controller.abort(); dispose?.(); };
  }, [clientId, attempt]);
  return <div className="space-y-3">
    <div ref={container} className="min-h-12 max-w-full" />
    {status === "loading" && <p role="status" className="text-base leading-7">טוענים את אפשרות הכניסה עם Google…</p>}
    {status === "error" && <div role="alert" className="text-base leading-7 text-red-800">
      <p>לא הצלחנו לטעון את Google. בדקו את החיבור לאינטרנט ונסו שוב. אם הבעיה נמשכת, שמרו את הטיוטה ורעננו את העמוד.</p>
      <button type="button" className="button button-secondary mt-3" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}>טעינת Google מחדש</button>
    </div>}
  </div>;
}
