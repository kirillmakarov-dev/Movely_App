"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentUser, MovelyApiError, type CurrentUser } from "@/lib/movely-api";
import { boundedSupportRequest, type SupportAudience } from "@/lib/support-api";

export function supportAccessLost(error: unknown) { return error instanceof MovelyApiError && [401, 403, 404].includes(error.status); }
export function supportWriteUncertain(error: unknown) { return !(error instanceof MovelyApiError) || error.status === 0 || error.status >= 500 && error.errorCode !== "SUPPORT_REQUESTS_DISABLED"; }
function allowed(user: CurrentUser | null, audience: SupportAudience): user is CurrentUser { return Boolean(user && (audience === "admin" ? user.role === "Admin" : user.role === "Customer" || user.role === "Mover")); }
type Result<T> = { kind: "ready"; user: CurrentUser; data: T } | { kind: "error"; error: unknown };
type MutationFailure = { error: unknown; uncertain: boolean; needsReview: boolean };
type OperationResult<R> = { kind: "success"; value: R } | { kind: "failed"; failure: MutationFailure } | { kind: "stale"; uncertain: boolean };
export function useSupportResource<T>(audience: SupportAudience, key: string, load: (signal: AbortSignal) => Promise<T>, onIdentity?: (id: string | null) => void) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<({ key: string; attempt: number } & Result<T>) | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<MutationFailure | null>(null);
  const generation = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const writeController = useRef<AbortController | null>(null);
  const writeStarted = useRef(false);
  const locked = useRef(false);
  const knownIdentity = useRef<string | null>(null);
  const refresh = useCallback(() => {
    generation.current += 1; readController.current?.abort(); writeController.current?.abort();
    if (writeStarted.current) setFailure({ error: new MovelyApiError("צריך לבדוק אם הפעולה נרשמה.", { status: 0, errorCode: "SUPPORT_INTERRUPTED" }), uncertain: true, needsReview: true });
    writeStarted.current = false; locked.current = false; setBusy(false); setAttempt((value) => value + 1);
  }, []);
  useEffect(() => {
    const controller = new AbortController(); readController.current = controller; const token = generation.current;
    void boundedSupportRequest(async (signal) => {
      const user = await getCurrentUser(signal);
      if (!allowed(user, audience)) throw new MovelyApiError("יש להיכנס לחשבון המתאים.", { status: user ? 403 : 401, errorCode: user ? "FORBIDDEN" : "UNAUTHORIZED" });
      if (signal.aborted || token !== generation.current) throw new DOMException("Aborted", "AbortError");
      if (knownIdentity.current && knownIdentity.current !== user.id) setFailure(null);
      knownIdentity.current = user.id;
      onIdentity?.(user.id);
      const data = await load(signal);
      return { user, data };
    }, controller.signal).then(({ user, data }) => {
      if (!controller.signal.aborted && token === generation.current) setState({ key, attempt, kind: "ready", user, data });
    }).catch((error) => {
      if (controller.signal.aborted || token !== generation.current) return;
      if (supportAccessLost(error)) { knownIdentity.current = null; setFailure(null); onIdentity?.(null); }
      setState({ key, attempt, kind: "error", error });
    });
    return () => controller.abort();
  }, [audience, key, load, attempt, onIdentity]);
  useEffect(() => {
    let foreground = document.visibilityState === "visible" && document.hasFocus();
    const leave = () => { foreground = false; };
    const enter = () => { if (document.visibilityState === "visible" && !foreground) { foreground = true; refresh(); } };
    const visibility = () => { if (document.visibilityState === "hidden") leave(); else enter(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { leave(); enter(); } };
    window.addEventListener("focus", enter); window.addEventListener("blur", leave); window.addEventListener("pageshow", restored); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("focus", enter); window.removeEventListener("blur", leave); window.removeEventListener("pageshow", restored); document.removeEventListener("visibilitychange", visibility); generation.current += 1; readController.current?.abort(); writeController.current?.abort(); };
  }, [refresh]);
  const view = state?.key === key && state.attempt === attempt ? state : { kind: "loading" as const };
  async function perform<R>(operation: (signal: AbortSignal) => Promise<R>, write = true): Promise<OperationResult<R>> {
    if (view.kind !== "ready" || locked.current) return { kind: "stale", uncertain: false };
    const controller = new AbortController(); writeController.current = controller; const token = generation.current;
    locked.current = true; setBusy(true); setFailure(null); let started = false;
    try {
      const user = await boundedSupportRequest((signal) => getCurrentUser(signal), controller.signal);
      if (controller.signal.aborted || token !== generation.current) return { kind: "stale", uncertain: false };
      if (!allowed(user, audience) || user.id !== view.user.id) {
        onIdentity?.(null); setFailure(null); setState({ key, attempt, kind: "error", error: new MovelyApiError("החשבון השתנה. יש לבדוק את הגישה מחדש.", { status: user ? 403 : 401, errorCode: "SUPPORT_ACCOUNT_CHANGED" }) }); return { kind: "stale", uncertain: false };
      }
      started = write; writeStarted.current = write;
      const result = await operation(controller.signal);
      return controller.signal.aborted || token !== generation.current ? { kind: "stale", uncertain: started } : { kind: "success", value: result };
    } catch (error) {
      if (controller.signal.aborted || token !== generation.current) return { kind: "stale", uncertain: started };
      const failure = { error, uncertain: started && supportWriteUncertain(error), needsReview: started && (supportWriteUncertain(error) || error instanceof MovelyApiError && (error.status === 409 || error.errorCode === "INVALID_SUPPORT_STATE")) };
      if (supportAccessLost(error)) { onIdentity?.(null); setFailure(null); setState({ key, attempt, kind: "error", error }); }
      else setFailure(failure);
      return { kind: "failed", failure };
    } finally {
      if (token === generation.current) { writeController.current = null; writeStarted.current = false; locked.current = false; setBusy(false); }
    }
  }
  function replace(data: T) { if (view.kind === "ready") setState({ key, attempt, kind: "ready", user: view.user, data }); }
  return { view, busy, failure, checkVersion: attempt, refresh, perform, replace, clearFailure: () => setFailure(null) };
}
