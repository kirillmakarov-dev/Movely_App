"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MovelyApiError } from "@/lib/movely-api";
import { LEGAL_DRAFT_VERSION } from "@/lib/legal-content";
import { isEditableStatus, isPublishedEditId, loadPublishedEditContext, savePublishedRequest, type PublishedEditContext } from "@/lib/published-request-api";
import { buildUpdatePayload } from "./request-form-model";
import type { FormState } from "./request-flow-types";
import { getRequestChanges } from "./RequestChangeSummary";

type Phase = "loading" | "ready" | "login" | "unavailable" | "failed" | "invalid";
type Apply = (context: PublishedEditContext | null, replaceForm: boolean) => void;
function sameSnapshot(a: PublishedEditContext, b: PublishedEditContext) {
  return a.request.currentVersion.id === b.request.currentVersion.id && a.request.status === b.request.status
    && a.publication.maxRecipients === b.publication.maxRecipients && a.publication.disclosureVersion === b.publication.disclosureVersion
    && a.publication.isTestOnly === b.publication.isTestOnly;
}
function denied(error: unknown) {
  return error instanceof MovelyApiError && (error.status === 401 || error.status === 404
    || (error.status === 403 && !["PHONE_NOT_VERIFIED", "POLICY_ACCEPTANCE_REQUIRED"].includes(error.errorCode)));
}
function errorCopy(error: unknown) {
  if (!(error instanceof MovelyApiError) || error.status === 0 || error.status >= 500 && error.errorCode !== "LEGAL_NOT_READY") return "לא ניתן לדעת אם השינוי נשמר. בדקו את הגרסה בשרת לפני ניסיון נוסף; לא נשלח שוב באופן אוטומטי.";
  if (error.status === 409) return "הגרסה, ההסכמה או מגבלת מקבלי הפרטים השתנו. טענו את המצב העדכני והשוו אותו לעריכות שלכם לפני שמירה נוספת.";
  if (error.errorCode === "PHONE_NOT_VERIFIED") return "צריך לאמת את הטלפון בחשבון. העריכות נשארות בעמוד; לאחר האימות חזרו ובדקו את החשבון מחדש.";
  if (error.errorCode === "POLICY_ACCEPTANCE_REQUIRED") return "צריך לקרוא ולאשר את תנאי השירות העדכניים בחשבון. לאחר האישור חזרו ובדקו מחדש.";
  if (error.errorCode === "LEGAL_NOT_READY") return "השירות עדיין אינו פתוח לשמירת שינויים בבקשה שפורסמה. העריכות נשארות בעמוד בלבד.";
  if (error.status === 429) return "בוצעו פעולות רבות בזמן קצר. המתינו מעט ובדקו מחדש לפני שמירה נוספת.";
  const validation: Record<string, string> = {
    INVALID_REQUEST_TYPE: "סוג ההובלה אינו תקין. בחרו סוג נתמך ובדקו את התכולה.",
    INVALID_SCHEDULE: "בדקו את תאריך ההובלה, השעה והגמישות במועד.",
    INVALID_BUDGET: "בחרו טווח תקציב מהרשימה.",
    INVALID_TEXT: "בדקו את אורך הטקסט בשדות ואת התווים שהוזנו.",
    INVALID_APARTMENT_DETAILS: "בדקו את מספר החדרים, הארגזים ופרטי הדירה.",
    INVALID_ITEM: "בדקו את סוגי הפריטים, הכמויות, המידות והמשקל.",
    INVALID_LOCATION: "בדקו את היישובים, הכתובות ופרטי הגישה באיסוף וביעד.",
    INVALID_PHOTO_METADATA: "לא ניתן לשמור את פרטי התמונות הקיימים. בדקו את גרסת השרת לפני המשך עריכה.",
  };
  return validation[error.errorCode] ?? "השינוי לא נשמר. בדקו את פרטי הבקשה לפני ניסיון נוסף.";
}

export function usePublishedRequestEdit(enabled: boolean, requestId: string | null, form: FormState, apply: Apply) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [attempt, setAttempt] = useState(0);
  const [context, setContext] = useState<PublishedEditContext | null>(null);
  const [pending, setPending] = useState<PublishedEditContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(false);
  const [acceptedChoice, setAcceptedChoice] = useState<{ fingerprint: string; form: FormState } | null>(null);
  const [categoryChoice, setCategoryChoice] = useState<{ fingerprint: string; form: FormState } | null>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const current = useRef(context);
  const writing = useRef(false);
  const mutationInFlight = useRef(false);
  const unknownWrite = useRef(false);
  const accountId = useRef<string | null>(null);
  useEffect(() => { current.current = context; }, [context]);
  const payload = useMemo(() => buildUpdatePayload(form, context?.request.currentVersion), [form, context]);
  const fingerprint = JSON.stringify([payload, context?.request.currentVersion.id, context?.publication.disclosureVersion, context?.publication.maxRecipients, context?.publication.isTestOnly]);
  const accepted = acceptedChoice?.fingerprint === fingerprint && acceptedChoice.form === form;
  const categoryChanged = Boolean(context && form.requestType !== context.request.requestType);
  const categoryAccepted = categoryChoice?.fingerprint === fingerprint && categoryChoice.form === form;
  const dirty = Boolean(context && getRequestChanges(context.request.currentVersion, payload).length > 0);

  const resetConsent = useCallback(() => { setAcceptedChoice(null); setCategoryChoice(null); }, []);
  const loseAccess = useCallback((next: Phase) => {
    accountId.current = null; current.current = null; unknownWrite.current = false;
    setContext(null); setPending(null); setUncertain(false); setNeedsRefresh(false); setSaved(false); setNotice("");
    resetConsent(); apply(null, true); setPhase(next);
  }, [apply, resetConsent]);
  const refresh = useCallback(() => {
    if (!enabled) return;
    generation.current += 1;
    if (mutationInFlight.current) { unknownWrite.current = true; setUncertain(true); setNeedsRefresh(true); }
    writing.current = false; mutationInFlight.current = false; controller.current?.abort(); setBusy(false); setSaved(false);
    resetConsent(); setPhase("loading"); setAttempt((value) => value + 1);
  }, [enabled, resetConsent]);

  useEffect(() => {
    if (!enabled) return;
    if (!requestId || !isPublishedEditId(requestId)) return;
    const operation = new AbortController(); controller.current = operation;
    const token = generation.current;
    void loadPublishedEditContext(requestId, operation.signal).then((latest) => {
      if (operation.signal.aborted || token !== generation.current) return;
      if (accountId.current && accountId.current !== latest.user.id) { loseAccess("unavailable"); return; }
      accountId.current = latest.user.id;
      const baseline = current.current;
      if (baseline && (!sameSnapshot(baseline, latest) || unknownWrite.current)) {
        setPending(latest); setNeedsRefresh(false); setNotice(unknownWrite.current
          ? "המצב העדכני נטען. בדקו אם העריכות שלכם כבר מופיעות בגרסה שבשרת. בחרו במפורש כיצד להמשיך; דבר לא יישלח בבחירה הזאת."
          : "הבקשה השתנתה מאז שהתחלתם לערוך. השינויים שלכם נשמרו בעמוד. השוו לגרסת השרת ובחרו כיצד להמשיך.");
      } else {
        setContext(latest); apply(latest, !baseline); setPending(null); setNeedsRefresh(false); setNotice("");
      }
      setPhase("ready");
    }).catch((error) => {
      if (operation.signal.aborted || token !== generation.current) return;
      if (denied(error)) loseAccess(error instanceof MovelyApiError && error.status === 401 ? "login" : "unavailable");
      else { setPhase("failed"); setNotice(error instanceof MovelyApiError && error.errorCode === "EDIT_SNAPSHOT_CHANGED" ? "הבקשה השתנתה בזמן הבדיקה. בדקו שוב כדי לטעון גרסה עקבית." : "לא הצלחנו לבדוק את הבקשה. העריכות שלכם נשארות בעמוד, אך אינן מוצגות עד לאימות הגישה מחדש."); }
    });
    return () => { operation.abort(); };
  }, [enabled, requestId, attempt, apply, loseAccess]);

  useEffect(() => {
    if (!enabled) return;
    let foreground = document.visibilityState === "visible" && document.hasFocus();
    const leave = () => { foreground = false; };
    const enter = () => { if (document.visibilityState === "visible" && !foreground) { foreground = true; refresh(); } };
    const visibility = () => { if (document.visibilityState === "hidden") leave(); else enter(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { leave(); enter(); } };
    window.addEventListener("focus", enter); window.addEventListener("blur", leave); window.addEventListener("pageshow", restored); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("focus", enter); window.removeEventListener("blur", leave); window.removeEventListener("pageshow", restored); document.removeEventListener("visibilitychange", visibility); generation.current += 1; controller.current?.abort(); };
  }, [enabled, refresh]);

  function chooseLatest(replaceForm: boolean) {
    if (!pending || !isEditableStatus(pending.request.status)) return;
    setContext(pending); current.current = pending; apply(pending, replaceForm); setPending(null);
    unknownWrite.current = false; setUncertain(false); setNeedsRefresh(false); resetConsent();
    setNotice(replaceForm ? "גרסת השרת נטענה במקום העריכות המקומיות. אפשר לבדוק ולערוך אותה מחדש."
      : "הפרטים שהקלדתם נשארו בטופס. בדקו את כל ההבדלים מול הגרסה העדכנית: שמירה תחליף את מלוא תוכן הבקשה, כולל שינויים שנשמרו ממקום אחר.");
  }
  const accountReady = Boolean(context?.user.phoneVerified && context.user.hasCurrentPolicyAcceptance);
  const legalReady = Boolean(context?.capabilities.policyAcceptanceAvailable && context.publication.disclosureVersion === LEGAL_DRAFT_VERSION);
  const canSave = Boolean(context && phase === "ready" && isEditableStatus(context.request.status) && accountReady && legalReady
    && context.publication.maxRecipients > 0 && !pending && !needsRefresh && !uncertain && !busy && !saved && dirty && accepted && (!categoryChanged || categoryAccepted));

  async function submit() {
    if (!canSave || !context || writing.current || !requestId) return;
    const token = generation.current; const operation = new AbortController(); controller.current = operation;
    writing.current = true; setBusy(true); setNotice("");
    let mutationStarted = false;
    try {
      // Recheck ownership/account and the reviewed snapshot before the only write.
      const latest = await loadPublishedEditContext(requestId, operation.signal);
      if (operation.signal.aborted || token !== generation.current) return;
      if (latest.user.id !== context.user.id) { loseAccess("unavailable"); return; }
      if (!sameSnapshot(context, latest)) { setPending(latest); resetConsent(); setNotice("הבקשה או תנאי ההסכמה השתנו. בדקו את הגרסה העדכנית לפני שמירה."); return; }
      if (!latest.user.phoneVerified || !latest.user.hasCurrentPolicyAcceptance || !latest.capabilities.policyAcceptanceAvailable) {
        setContext(latest); apply(latest, false); resetConsent(); setNotice("צריך להשלים את דרישות החשבון והשירות לפני שמירה. העריכות נשארות בעמוד."); return;
      }
      mutationStarted = true;
      mutationInFlight.current = true;
      const result = await savePublishedRequest(latest, payload, operation.signal);
      if (operation.signal.aborted || token !== generation.current) return;
      const updated = { ...latest, request: result, publication: { ...latest.publication, currentVersionId: result.currentVersion.id } };
      setContext(updated); current.current = updated; apply(updated, true); resetConsent(); setSaved(true);
      setNotice("השינויים נשמרו בגרסה חדשה. ההסכמה להעברת פרטים נרשמה לגרסה הזאת.");
    } catch (error) {
      if (operation.signal.aborted || token !== generation.current) return;
      resetConsent();
      if (denied(error)) { loseAccess(error instanceof MovelyApiError && error.status === 401 ? "login" : "unavailable"); return; }
      const unknown = mutationStarted && (!(error instanceof MovelyApiError) || error.status === 0 || error.status >= 500 && error.errorCode !== "LEGAL_NOT_READY");
      unknownWrite.current = unknown; setUncertain(unknown);
      setNeedsRefresh(unknown || !mutationStarted || error instanceof MovelyApiError && (error.status === 409 || error.status === 403 || error.status === 429 || ["PHONE_NOT_VERIFIED", "POLICY_ACCEPTANCE_REQUIRED", "LEGAL_NOT_READY", "INVALID_REQUEST_STATE"].includes(error.errorCode)));
      setNotice(mutationStarted ? errorCopy(error) : "לא הצלחנו לבדוק את החשבון ואת הגרסה לפני השמירה. לא נשלחה שמירה. בדקו מחדש; העריכות נשארות בעמוד.");
    } finally {
      if (token === generation.current) { writing.current = false; mutationInFlight.current = false; setBusy(false); }
    }
  }
  return { phase: enabled && (!requestId || !isPublishedEditId(requestId)) ? "invalid" as const : phase, context, pending, busy, needsRefresh, uncertain, notice, saved, payload, accepted, categoryChanged, categoryAccepted, dirty, accountReady, legalReady, canSave, refresh, chooseLatest, submit,
    setAccepted: (checked: boolean) => setAcceptedChoice(checked ? { fingerprint, form } : null),
    setCategoryAccepted: (checked: boolean) => setCategoryChoice(checked ? { fingerprint, form } : null) };
}

export type PublishedEditor = ReturnType<typeof usePublishedRequestEdit>;
