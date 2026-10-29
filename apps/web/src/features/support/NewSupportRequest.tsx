"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/SafeLink";
import { MovelyApiError } from "@/lib/movely-api";
import { createSupportRequest, findSupportSubmission, getSupportCapabilities, supportTopics, type SupportCreateInput, type SupportDetail, type SupportTopic } from "@/lib/support-api";
import { useSupportResource } from "./useSupportResource";
import SupportError from "./SupportError";
import { SupportReceiptNotice, SupportSafetyNotice, supportTopicHints, supportTopicLabels } from "./support-presentation";

export default function NewSupportRequest() {
  const [type, setType] = useState<SupportTopic>("General");
  const [subject, setSubject] = useState(""); const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<{ subject?: string; message?: string }>({});
  const [confirm, setConfirm] = useState(false); const [retryConfirm, setRetryConfirm] = useState(false);
  const [frozen, setFrozen] = useState<SupportCreateInput | null>(null); const [unknown, setUnknown] = useState(false);
  const [checkedMissing, setCheckedMissing] = useState(false); const [receipt, setReceipt] = useState<SupportDetail | null>(null);
  const owner = useRef<string | null>(null);
  const sending = useRef(false);
  const identity = useCallback((id: string | null) => {
    if (owner.current === id) return; owner.current = id;
    setType("General"); setSubject(""); setMessage(""); setErrors({}); setConfirm(false); setRetryConfirm(false); setFrozen(null); setUnknown(false); setCheckedMissing(false); setReceipt(null);
  }, []);
  const load = useCallback((signal: AbortSignal) => getSupportCapabilities(signal), []);
  const resource = useSupportResource("owner", "new-support-request", load, identity);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (!receipt && (subject.trim() || message.trim() || frozen)) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [subject, message, frozen, receipt]);
  async function send(input: SupportCreateInput, wasUncertain = false) {
    if (sending.current) return;
    sending.current = true;
    setFrozen(input); setRetryConfirm(false);
    const result = await resource.perform((signal) => createSupportRequest(input, signal));
    if (result.kind === "success") { setReceipt(result.value.request); setFrozen(null); setUnknown(false); setConfirm(false); }
    else if (result.kind === "failed") { setConfirm(false); if (result.failure.uncertain || wasUncertain) setUnknown(true); else setFrozen(null); if (result.failure.error instanceof MovelyApiError && result.failure.error.errorCode === "SUPPORT_REQUESTS_DISABLED") resource.replace({ requestsEnabled: false }); }
    else if (result.uncertain) setUnknown(true); else setFrozen(null);
    sending.current = false;
  }
  function review() {
    const next = { subject: subject.trim().length < 2 || subject.length > 160 ? "כתבו כותרת באורך 2 עד 160 תווים." : undefined,
      message: message.trim().length < 2 || message.length > 4000 ? "כתבו הודעה באורך 2 עד 4,000 תווים." : undefined };
    setErrors(next);
    if (next.subject || next.message) { document.getElementById(next.subject ? "support-subject" : "support-message")?.focus(); return; }
    setConfirm(true);
  }
  async function checkSubmission() {
    if (!frozen) return;
    const result = await resource.perform((signal) => findSupportSubmission(frozen.clientMutationId, signal), false);
    if (result.kind === "success") {
      if (result.value && result.value.type === frozen.type && result.value.subject === frozen.subject) { setReceipt(result.value); setFrozen(null); setUnknown(false); }
      else setCheckedMissing(true);
    }
  }
  if (resource.view.kind === "loading") return <p role="status" className="text-base leading-7">בודקים את החשבון ואת זמינות הפניות…</p>;
  if (resource.view.kind === "error") return <SupportError error={resource.view.error} retry={resource.refresh} />;
  const viewer = resource.view.user;
  if (receipt) return <section className="max-w-3xl space-y-5 rounded-xl border border-emerald-200 bg-white p-5 sm:p-6">
    <h1 className="text-3xl font-bold">הפנייה נרשמה</h1><p role="status" className="text-base leading-7">הפנייה ״{receipt.subject}״ מופיעה בחשבון שלכם. אפשר לעקוב אחרי ההודעות והמצב בעמוד הפנייה.</p>
    <SupportReceiptNotice /><Link href={`/account/support/${receipt.id}`} className="button button-primary">צפייה בפנייה</Link>
  </section>;
  const locked = Boolean(frozen && (unknown || resource.failure?.uncertain));
  return <div className="max-w-3xl space-y-5">
    <Link href="/account/support" className="inline-link" style={{ minHeight: 48 }}>חזרה לפניות שלי</Link><h1 className="text-3xl font-bold">פנייה חדשה</h1>
    <SupportReceiptNotice /><SupportSafetyNotice />
    {!resource.view.data.requestsEnabled && <section className="space-y-3 rounded-xl border border-amber-200 bg-white p-4 text-base leading-7"><p role="status">שליחת פניות חדשות אינה זמינה כעת. אפשר עדיין לקרוא פניות קודמות ולבטל פנייה פתוחה. טקסט שכבר כתבתם נשאר בעמוד בלבד.</p><button type="button" disabled={resource.busy} onClick={resource.refresh} className="button button-secondary">בדיקת זמינות השליחה מחדש</button></section>}
    {resource.failure && <SupportError error={resource.failure.error} />}
    {locked && frozen && <section className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-5 text-base leading-7">
      <h2 className="text-xl font-bold">צריך לבדוק אם הפנייה נרשמה</h2>
      <p>לא נשלח דבר נוסף באופן אוטומטי. פרטי השליחה נשארו נעולים כדי שלא ייווצרו גרסאות שונות של אותה פנייה.</p>
      {checkedMissing && <p role="status">הפנייה עדיין לא נמצאה בבדיקה. ייתכן שהשליחה הקודמת עדיין מסתיימת; אין בכך אישור שלא נרשמה.</p>}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={resource.busy} className="button button-secondary" onClick={() => void checkSubmission()}>בדיקת רישום הפנייה</button><Link href="/account/support" target="_blank" rel="noopener noreferrer" className="button button-secondary">הפניות שלי (בכרטיסייה חדשה)</Link></div>
      {!retryConfirm ? <button type="button" disabled={resource.busy} className="button button-secondary" onClick={() => setRetryConfirm(true)}>ניסיון נוסף לאותה פנייה</button>
        : <div role="group" aria-label="אישור ניסיון נוסף" className="space-y-3"><p>יישלחו בדיוק אותם נושא, כותרת ותוכן. אם הפנייה כבר נרשמה, תוחזר אותה פנייה ולא ייווצר עותק נוסף.</p><div className="flex flex-wrap gap-3"><button type="button" disabled={resource.busy} className="button button-primary" onClick={() => void send(frozen, true)}>אישור ניסיון נוסף לאותה פנייה</button><button type="button" disabled={resource.busy} className="button button-secondary" onClick={() => setRetryConfirm(false)}>חזרה לבדיקה</button></div></div>}
    </section>}
    <form className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6" onSubmit={(event) => { event.preventDefault(); review(); }} noValidate>
      <fieldset disabled={resource.busy || locked || !resource.view.data.requestsEnabled} className="space-y-5">
        <label className="field-label text-base">נושא הפנייה<select className="field-control min-h-12 text-base" style={{ minHeight: 48 }} value={type} onChange={(event) => { setType(event.target.value as SupportTopic); setConfirm(false); }} aria-describedby="support-topic-hint">{supportTopics.map((topic) => <option key={topic} value={topic}>{supportTopicLabels[topic]}</option>)}</select></label>
        <p id="support-topic-hint" className="text-base leading-7">{supportTopicHints[type]}</p>
        <label className="field-label text-base" htmlFor="support-subject">כותרת קצרה</label><input id="support-subject" className="field-control min-h-12 text-base" style={{ minHeight: 48 }} value={subject} maxLength={160} required aria-invalid={Boolean(errors.subject)} aria-describedby={errors.subject ? "support-subject-error" : undefined} onChange={(event) => { setSubject(event.target.value); setConfirm(false); }} />
        {errors.subject && <p id="support-subject-error" className="text-base text-red-800">{errors.subject}</p>}
        <label className="field-label text-base" htmlFor="support-message">מה תרצו שנבדוק?</label><textarea id="support-message" className="field-control min-h-40 text-base" style={{ minHeight: 160 }} value={message} maxLength={4000} required aria-invalid={Boolean(errors.message)} aria-describedby={errors.message ? "support-message-error support-message-count" : "support-message-count"} onChange={(event) => { setMessage(event.target.value); setConfirm(false); }} />
        {errors.message && <p id="support-message-error" className="text-base text-red-800">{errors.message}</p>}<p id="support-message-count" className="text-base text-slate-600">{message.length} מתוך 4,000 תווים. הטקסט נשאר בעמוד עד לשליחה.</p>
        {!confirm ? <button type="submit" className="button button-primary">בדיקת הפנייה לפני שליחה</button> : <section role="group" aria-label="אישור שליחת הפנייה" className="space-y-3 rounded-xl bg-sky-50 p-4 text-base leading-7"><h2 className="text-xl font-bold">בדקו לפני השליחה</h2><p>{supportTopicLabels[type]} · {subject.trim()}</p><p className="whitespace-pre-wrap break-words">{message.trim()}</p><p>התוכן יישמר בפנייה בחשבון ויהיה זמין לצוות המטפל. שליחה אינה מבצעת שינוי או מחיקה של מידע.</p><div className="flex flex-wrap gap-3"><button type="button" className="button button-primary" onClick={() => void send({ clientMutationId: crypto.randomUUID(), expectedActorUserId: viewer.id, type, subject: subject.trim(), message: message.trim() })}>אישור ושליחת הפנייה</button><button type="button" className="button button-secondary" onClick={() => setConfirm(false)}>חזרה לעריכה</button></div></section>}
      </fieldset>
      {resource.busy && <p role="status" className="mt-4 text-base leading-7">בודקים את החשבון ומשלימים את הפעולה… אל תסגרו את העמוד.</p>}
    </form>
  </div>;
}
