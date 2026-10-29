"use client";

import Link from "@/components/SafeLink";
import { useEffect, useState } from "react";
import { getAuthCapabilities, type AuthCapabilities } from "@/lib/movely-api";

export function useAuthCapabilities() {
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); setFailed(true); }, 10_000);
    void getAuthCapabilities(controller.signal).then((value) => { if (!controller.signal.aborted) setCapabilities(value); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [attempt]);
  return { capabilities, failed, retry: () => { setFailed(false); setCapabilities(null); setAttempt((value) => value + 1); } };
}

export default function AuthServiceStatus({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-base leading-7">
    <p role="status">{message}</p>
    {retry && <button type="button" className="button button-secondary" onClick={retry}>בדיקה נוספת</button>}
    <Link href="/help" target="_blank" rel="noopener" className="inline-flex min-h-12 items-center font-semibold text-sky-900 underline">עזרה והסברים (בלשונית חדשה)</Link>
  </div>;
}
