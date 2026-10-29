"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/SafeLink";
import { MovelyApiError } from "@/lib/movely-api";
import { getSupportCapabilities, getSupportRequest, matchesSupportCommandEvent, sendSupportCommand, supportEffectiveCount, type SupportAudience, type SupportCommand, type SupportStatus } from "@/lib/support-api";
import { useSupportResource } from "./useSupportResource";
import SupportError from "./SupportError";
import { SupportReceiptNotice, SupportSafetyNotice, SupportTime, supportStatusLabels, supportTopicLabels } from "./support-presentation";

const adminReplyStatuses = ["Open", "InReview", "WaitingForUser", "Resolved"] as const;
const historyLabels = { Created: "פתיחת הפנייה", Message: "הודעה", StatusChanged: "שינוי מצב", Cancelled: "ביטול הפנייה" };
type Decision = "reply" | "cancel" | "status";
export default function SupportRequestDetails({ audience, requestId, historyPage = 1 }: { audience: SupportAudience; requestId: string; historyPage?: number }) {
  return <Details key={`${audience}-${requestId}`} audience={audience} requestId={requestId} historyPage={historyPage} />;
}
function Details({ audience, requestId, historyPage }: { audience: SupportAudience; requestId: string; historyPage: number }) {
  const [body, setBody] = useState(""); const [nextStatus, setNextStatus] = useState<Exclude<SupportStatus, "Cancelled"> | "">("");
  const [draftRevision, setDraftRevision] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Decision | null>(null); const [fieldError, setFieldError] = useState("");
  const [errorField, setErrorField] = useState<"body" | "status" | null>(null);
  const [frozen, setFrozen] = useState<SupportCommand | null>(null); const [unknown, setUnknown] = useState(false); const [needsReviewAt, setNeedsReviewAt] = useState<number | null>(null);
  const [notice, setNotice] = useState(""); const [retryConfirm, setRetryConfirm] = useState(false);
  const identityRef = useRef<string | null>(null); const sending = useRef(false);
  const identity = useCallback((id: string | null) => {
    if (identityRef.current === id) return; identityRef.current = id;
    setBody(""); setNextStatus(""); setDraftRevision(null); setConfirm(null); setFieldError(""); setFrozen(null); setUnknown(false); setNeedsReviewAt(null); setNotice(""); setRetryConfirm(false);
  }, []);
  const load = useCallback(async (signal: AbortSignal) => {
    const [request, capabilities] = await Promise.all([getSupportRequest(audience, requestId, historyPage, signal), getSupportCapabilities(signal)]);
    return { request, capabilities };
  }, [audience, requestId, historyPage]);
  const resource = useSupportResource(audience, `${audience}-${requestId}-${historyPage}`, load, identity);
  const base = audience === "admin" ? "/admin/support" : "/account/support";
  const pageHref = (page: number) => `${base}/${requestId}${page === 1 ? "" : `?page=${page}`}`;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (body.trim() || frozen) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [body, frozen]);
  if (resource.view.kind === "loading") return <p role="status" className="text-base leading-7">בודקים את החשבון וטוענים את הפנייה…</p>;
  if (resource.view.kind === "error") return <div className="space-y-4"><SupportError error={resource.view.error} retry={resource.refresh} /><Link href={base} className="button button-secondary">חזרה לפניות</Link></div>;
  const { request, capabilities } = resource.view.data;
  const viewer = resource.view.user;
  const similarEvent = frozen ? request.history.items.find((item) => matchesSupportCommandEvent(audience, frozen, item)) : null;
  const lockedUnknown = Boolean(frozen && (unknown || resource.failure?.uncertain));
  const changed = Boolean(draftRevision && draftRevision !== request.revisionId);
  const needsReview = needsReviewAt !== null;
  const blocked = lockedUnknown || needsReview || changed;
  const latestPage = request.history.page === 1;
  const canReply = request.status !== "Cancelled" && capabilities.requestsEnabled && latestPage;
  const canCancel = audience === "owner" && ["Open", "InReview", "WaitingForUser"].includes(request.status) && latestPage;
  const canTakeReview = audience === "admin" && ["Open", "WaitingForUser", "Resolved"].includes(request.status) && latestPage;

  function acceptLatest() { setDraftRevision(request.revisionId); setNextStatus(""); setConfirm(null); setFieldError(""); setNeedsReviewAt(null); resource.clearFailure(); setNotice("המצב העדכני נבדק. הטקסט שלכם נשאר בטופס; בדקו אותו שוב לפני שליחה."); }
  async function send(command: SupportCommand, wasUncertain = false) {
    if (sending.current) return; sending.current = true; setFrozen(command); setRetryConfirm(false); setNotice("");
    const result = await resource.perform((signal) => sendSupportCommand(audience, requestId, command, signal));
    if (result.kind === "success") {
      resource.replace({ request: result.value.request, capabilities });
      if (command.kind !== "status") setBody("");
      setDraftRevision(command.kind === "status" ? result.value.request.revisionId : null); setNextStatus(""); setFrozen(null); setUnknown(false); setNeedsReviewAt(null); setConfirm(null);
      setNotice(command.kind === "reply" ? "ההודעה נרשמה בפנייה." : command.kind === "cancel" ? "הפנייה בוטלה. ההיסטוריה נשארת זמינה." : "הפנייה הועברה לטיפול הצוות.");
    } else if (result.kind === "failed") {
      setConfirm(null);
      const definitiveRevisionConflict = result.failure.error instanceof MovelyApiError && result.failure.error.status === 409 && result.failure.error.errorCode === "SUPPORT_REVISION_CONFLICT";
      // The server checks the immutable receipt before its revision guard. This
      // conflict proves that this exact command did not win the old revision.
      if (definitiveRevisionConflict) { setUnknown(false); setFrozen(null); setNeedsReviewAt(resource.checkVersion); }
      else if (result.failure.uncertain || wasUncertain) setUnknown(true);
      else { setFrozen(null); setNeedsReviewAt(result.failure.needsReview ? resource.checkVersion : null); }
      if (result.failure.error instanceof MovelyApiError && result.failure.error.errorCode === "SUPPORT_REQUESTS_DISABLED") resource.replace({ request, capabilities: { requestsEnabled: false } });
    } else if (result.uncertain) setUnknown(true); else setFrozen(null);
    sending.current = false;
  }
  function reviewReply() {
    if (body.trim().length < 2 || body.length > 4000) { setErrorField("body"); setFieldError("כתבו הודעה באורך 2 עד 4,000 תווים."); document.getElementById("support-reply")?.focus(); return; }
    if (audience === "admin" && !nextStatus) { setErrorField("status"); setFieldError("בחרו את מצב הפנייה לאחר המענה."); document.getElementById("support-reply-status")?.focus(); return; }
    setFieldError(""); setDraftRevision(request.revisionId); setConfirm("reply");
  }
  function buildCommand(kind: Decision): SupportCommand {
    const common = { clientMutationId: crypto.randomUUID(), expectedActorUserId: viewer.id, expectedRevisionId: request.revisionId };
    return kind === "reply" ? { ...common, kind, body: body.trim(), ...(audience === "admin" && nextStatus ? { status: nextStatus } : {}) }
      : kind === "status" ? { ...common, kind, status: "InReview" } : { ...common, kind };
  }
  const actionAllowed = confirm === "reply" ? canReply : confirm === "cancel" ? canCancel : canTakeReview;
  const confirmation = confirm && actionAllowed && <section role="group" aria-label="אישור הפעולה בפנייה" className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-5 text-base leading-7">
    <h2 className="text-xl font-bold">{confirm === "reply" ? "בדקו את ההודעה לפני השליחה" : confirm === "cancel" ? "ביטול הפנייה" : "העברת הפנייה לטיפול"}</h2>
    {confirm === "reply" ? <><p className="whitespace-pre-wrap break-words">{body.trim()}</p><p>{audience === "admin" ? `ההודעה תוצג לבעל החשבון. המצב לאחר השליחה: ${nextStatus ? supportStatusLabels[nextStatus] : ""}.` : "ההודעה תירשם ותהיה זמינה לצוות המטפל."}</p></>
      : <p>{confirm === "cancel" ? "הפנייה תסומן כמבוטלת ולא יהיה אפשר להוסיף לה הודעות. טקסט שטרם שלחתם לא יישמר. הביטול אינו מוחק את ההיסטוריה ואינו מבטל שינוי במידע שכבר בוצע." : "הפנייה תסומן כבטיפול. פעולה זו אינה שולחת תשובה ואינה מבצעת שינוי או מחיקה של נתוני המשתמש. הודעה שטרם שלחתם תישאר בטופס."}</p>}
    <div className="flex flex-wrap gap-3"><button type="button" disabled={resource.busy || blocked} className="button button-primary" onClick={() => void send(buildCommand(confirm))}>{confirm === "reply" ? "אישור ושליחת ההודעה" : confirm === "cancel" ? "אישור ביטול הפנייה" : "אישור העברה לטיפול"}</button><button type="button" disabled={resource.busy} className="button button-secondary" onClick={() => setConfirm(null)}>חזרה ללא שליחה</button></div>
  </section>;
  return <div className="max-w-4xl space-y-6">
    <div className="flex flex-wrap items-center gap-4"><Link href={base} className="inline-link" style={{ minHeight: 48 }}>חזרה לפניות</Link><button type="button" disabled={resource.busy} className="button button-secondary" onClick={resource.refresh}>בדיקת מצב עדכני</button></div>
    <header className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><h1 className="break-words text-3xl font-bold">{request.subject}</h1><p className="text-base">{supportTopicLabels[request.type]}</p><p className="text-base font-bold">מצב: {supportStatusLabels[request.status]}</p><p className="text-base text-slate-600">עודכן: <SupportTime value={request.updatedAt} /></p>{audience === "admin" && request.owner && <p className="break-words text-base">בעל החשבון: {request.owner.name}</p>}<SupportReceiptNotice /></header>
    {!capabilities.requestsEnabled && <p role="status" className="rounded-xl border border-amber-200 bg-white p-4 text-base leading-7">שליחת הודעות חדשות אינה זמינה כעת. אפשר לקרוא את ההיסטוריה{audience === "owner" ? " ולבטל פנייה פתוחה." : " ולהעביר פנייה לבדיקה."}</p>}
    {notice && <p role="status" className="rounded-xl bg-sky-50 p-4 text-base leading-7">{notice}</p>}
    {resource.failure && <SupportError error={resource.failure.error} />}
    {lockedUnknown && frozen && <section className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-5 text-base leading-7"><h2 className="text-xl font-bold">צריך לבדוק אם הפעולה נרשמה</h2>
      {similarEvent && <p role="status">מופיעה בהיסטוריה פעולה דומה. כדי לקבל אישור לתוצאת השליחה שלכם, אפשר לבקש שוב את אותה פעולה ללא יצירת עותק נוסף.</p>}
      <p>עדיין אין אישור לתוצאת השליחה. ההודעה והפעולה נשארו נעולות. לא נשלח שוב באופן אוטומטי.</p><button type="button" disabled={resource.busy} onClick={resource.refresh} className="button button-secondary">בדיקת ההיסטוריה העדכנית</button>
          {!retryConfirm ? <button type="button" disabled={resource.busy} className="button button-secondary" onClick={() => setRetryConfirm(true)}>ניסיון נוסף לאותה פעולה</button>
            : <div role="group" aria-label="אישור ניסיון נוסף" className="space-y-3"><p>תישלח בדיוק אותה פעולה. אם כבר נרשמה, תוחזר התוצאה שלה ולא תתווסף פעולה כפולה.</p><div className="flex flex-wrap gap-3"><button type="button" disabled={resource.busy} className="button button-primary" onClick={() => void send(frozen, true)}>אישור ניסיון נוסף לאותה פעולה</button><button type="button" disabled={resource.busy} className="button button-secondary" onClick={() => setRetryConfirm(false)}>חזרה לבדיקה</button></div></div>}
    </section>}
    {!lockedUnknown && (needsReview || changed) && <section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-5 text-base leading-7"><h2 className="text-xl font-bold">הפנייה השתנתה מאז שהתחלתם לכתוב</h2><p>הטקסט שלכם נשמר בעמוד. טענו וקראו את ההודעות והמצב העדכניים, ואז בדקו מחדש את התשובה שלכם.</p><div className="flex flex-wrap gap-3"><button type="button" onClick={resource.refresh} className="button button-secondary">טעינת המצב העדכני</button><button type="button" disabled={needsReviewAt !== null && resource.checkVersion <= needsReviewAt} onClick={acceptLatest} className="button button-secondary">קראתי את המצב המוצג, להמשך בדיקה</button></div></section>}
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-2xl font-bold">היסטוריית הפנייה</h2><p className="text-base leading-7 text-slate-600">ההודעות והפעולות בעמוד הזה מוצגות מהחדשה לישנה.</p>
      <ol className="space-y-4">{request.history.items.map((event) => <li key={event.id} className={`min-w-0 rounded-xl border p-4 ${event.actor === "Support" ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-white"}`}><div className="flex flex-wrap justify-between gap-2 text-base"><h3 className="font-bold">{event.actor === "Support" ? "צוות האתר" : audience === "owner" ? "אתם" : "בעל החשבון"} · {historyLabels[event.kind]}</h3><SupportTime value={event.createdAt} /></div>{event.body !== null && <p className="mt-3 whitespace-pre-wrap break-words text-base leading-7">{event.body}</p>}{event.previousStatus !== event.status && <p className="mt-3 text-base">מצב: {supportStatusLabels[event.status]}</p>}</li>)}</ol>
      {!request.history.items.length && <p className="text-base">אין רשומות בעמוד הזה. אפשר לחזור לעמוד הראשון.</p>}
      <nav aria-label="עמודי היסטוריית הפנייה" className="flex flex-wrap items-center gap-3 text-base"><span>עמוד {request.history.page}</span>{request.history.page > 1 && <><Link href={pageHref(1)} className="button button-secondary">להודעות האחרונות</Link><Link href={pageHref(request.history.page - 1)} className="button button-secondary">לעמוד הקודם</Link></>}{request.history.page * request.history.pageSize < supportEffectiveCount(request.history) && <Link href={pageHref(request.history.page + 1)} className="button button-secondary">להודעות קודמות</Link>}</nav>
    </section>
    {!latestPage && <p className="text-base leading-7">לפני פעולה חדשה, חזרו להודעות האחרונות ובדקו את המצב העדכני.</p>}
    {request.status === "Cancelled" && <p className="rounded-xl bg-slate-100 p-4 text-base leading-7">הפנייה בוטלה ואינה פתוחה להודעות נוספות.{audience === "owner" && capabilities.requestsEnabled && <> אפשר <Link href="/account/support/new" className="underline">לפתוח פנייה חדשה</Link>.</>}</p>}
    {canReply && <form className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6" noValidate onSubmit={(event) => { event.preventDefault(); if (!blocked) reviewReply(); }}><h2 className="text-2xl font-bold">{audience === "admin" ? "תשובה לבעל החשבון" : "הוספת הודעה"}</h2><SupportSafetyNotice /><fieldset disabled={resource.busy || blocked} className="space-y-4">
      <label htmlFor="support-reply" className="field-label text-base">תוכן ההודעה</label><textarea id="support-reply" className="field-control min-h-36 text-base" style={{ minHeight: 160 }} maxLength={4000} value={body} aria-invalid={Boolean(fieldError) && errorField === "body"} aria-describedby={fieldError && errorField === "body" ? "support-reply-error" : undefined} onChange={(event) => { setBody(event.target.value); if (!draftRevision) setDraftRevision(request.revisionId); setConfirm(null); }} />
      <p className="text-base text-slate-600">{body.length} מתוך 4,000 תווים. הטקסט נשאר בעמוד עד לשליחה.</p>
      {audience === "admin" && <label className="field-label text-base" htmlFor="support-reply-status">מצב לאחר המענה<select id="support-reply-status" className="field-control min-h-12 text-base" style={{ minHeight: 48 }} value={nextStatus} aria-invalid={Boolean(fieldError) && errorField === "status"} aria-describedby={fieldError && errorField === "status" ? "support-reply-error" : undefined} onChange={(event) => { setNextStatus(event.target.value as Exclude<SupportStatus, "Cancelled">); if (!draftRevision) setDraftRevision(request.revisionId); setConfirm(null); }}><option value="">בחרו מצב</option>{adminReplyStatuses.map((status) => <option value={status} key={status}>{supportStatusLabels[status]}</option>)}</select><span className="font-normal leading-7">סגירת פנייה מתעדת את סיום הטיפול. היא אינה מבצעת מחיקה, תיקון או מסירה של נתונים.</span></label>}
      {fieldError && <p id="support-reply-error" role="alert" className="text-base text-red-800">{fieldError}</p>}
      {audience === "owner" && ["Resolved", "WaitingForUser"].includes(request.status) && <p className="text-base leading-7">שליחת תשובה תפתח את הפנייה להמשך טיפול.</p>}
      <button type="submit" className="button button-primary">בדיקת ההודעה לפני שליחה</button>
    </fieldset></form>}
    {(canCancel || canTakeReview) && <div className="flex flex-wrap gap-3">{canCancel && <button type="button" disabled={resource.busy || blocked} className="button button-secondary" onClick={() => { setDraftRevision(request.revisionId); setConfirm("cancel"); }}>ביטול הפנייה</button>}{canTakeReview && <button type="button" disabled={resource.busy || blocked} className="button button-secondary" onClick={() => { setDraftRevision(request.revisionId); setConfirm("status"); }}>העברה לטיפול הצוות</button>}</div>}
    {confirmation}
    {resource.busy && <p role="status" className="text-base leading-7">בודקים את החשבון ומשלימים את הפעולה… אל תסגרו את העמוד.</p>}
  </div>;
}
