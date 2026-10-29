"use client";
import { useCallback, useEffect, useState } from "react";
import { MovelyApiError } from "@/lib/movely-api";
type Resource<T> = { key: string; attempt: number } & ({ kind: "loading" } | { kind: "ready"; data: T } | { kind: "error"; error: unknown });
export default function useMarketplaceResource<T>(load: (signal: AbortSignal) => Promise<T>, key: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Resource<T>>({ key, attempt: 0, kind: "loading" });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let settled = false;
    const timeout = setTimeout(() => {
      if (!active || settled) return;
      settled = true; controller.abort();
      setState({ key, attempt, kind: "error", error: new MovelyApiError("הטעינה נמשכת זמן רב מדי.", { errorCode: "MARKETPLACE_TIMEOUT", status: 0 }) });
    }, 10_000);
    void load(controller.signal).then((data) => {
      if (!active || settled) return;
      settled = true; clearTimeout(timeout); setState({ key, attempt, kind: "ready", data });
    }).catch((error: unknown) => {
      if (!active || settled) return;
      settled = true; clearTimeout(timeout); setState({ key, attempt, kind: "error", error });
    });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [load, key, attempt]);
  const view: Resource<T> = state.key === key && state.attempt === attempt ? state : { key, attempt, kind: "loading" };
  return { ...view, retry };
}
