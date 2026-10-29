"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MovelyApiError } from "@/lib/movely-api";
import { getAdminBusiness, reviewBusiness, type AdminBusiness, type ReviewDecision } from "@/lib/business-api";
import { AdminGate, BusinessError, BusinessSummary, businessStatusLabels, denied, uncertain, useBusinessResource } from "./business-ui";
const decisionLabels: Record<ReviewDecision, string> = { Verify: "אישור העסק", Reject: "בקשת תיקונים", Suspend: "השעיית העסק", Reopen: "פתיחה לבדיקה חוזרת" };
type ReviewDraft = { adminId: string; businessId: string; revisionId: string; decision: ReviewDecision | ""; ownerMessage: string; internalNotes: string; registryChecked: boolean; representativeChecked: boolean };
export default function AdminBusinessDetails({ businessId }: { businessId: string }) {
  // Sensitive review drafts live only in this mounted page, bound to both identities.
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const identityChanged = useCallback((adminId: string | null) => setDraft((value) => value?.adminId === adminId ? value : null), []);
  return <AdminGate onIdentity={identityChanged}>{(adminId) => <DetailLoader key={`${adminId}-${businessId}`} businessId={businessId} adminId={adminId} draft={draft} onDraft={setDraft} />}</AdminGate>;
}
function DetailLoader({ businessId, adminId, draft, onDraft }: { businessId: string; adminId: string; draft: ReviewDraft | null; onDraft: (draft: ReviewDraft | null) => void }) {
  const load = useCallback((signal: AbortSignal) => getAdminBusiness(businessId, signal), [businessId]);
  const state = useBusinessResource(load, businessId);
  const accessDenied = state.kind === "error" && denied(state.error);
  useEffect(() => { if (accessDenied) onDraft(null); }, [accessDenied, onDraft]);
  if (state.kind === "loading") return <p role="status">טוענים פרטי עסק לבדיקה…</p>;
  if (state.kind === "error") return <BusinessError error={state.error} retry={state.retry} />;
  return <ReviewForm initial={state.data} adminId={adminId} draft={draft} onDraft={onDraft} />;
}
function ReviewForm({ initial, adminId, draft, onDraft }: { initial: AdminBusiness; adminId: string; draft: ReviewDraft | null; onDraft: (draft: ReviewDraft | null) => void }) {
  const saved = draft?.adminId === adminId && draft.businessId === initial.id ? draft : null;
  const sameRevision = saved?.revisionId === initial.revisionId;
  const [profile, setProfile] = useState(initial); const [decision, setDecision] = useState<ReviewDecision | "">(sameRevision ? saved!.decision : "");
  const [ownerMessage, setOwnerMessage] = useState(saved?.ownerMessage ?? ""); const [internalNotes, setInternalNotes] = useState(saved?.internalNotes ?? "");
  const [registryChecked, setRegistryChecked] = useState(sameRevision && saved!.registryChecked); const [representativeChecked, setRepresentativeChecked] = useState(sameRevision && saved!.representativeChecked);
  const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false); const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<unknown>(null); const [notice, setNotice] = useState(saved && !sameRevision ? "פרטי העסק השתנו. התיעוד שכתבתם נשמר, אך יש לבדוק מחדש את הפרטים ולסמן מחדש את אישורי הבדיקה." : ""); const [lost, setLost] = useState(false);
  useEffect(() => { onDraft({ adminId, businessId: profile.id, revisionId: profile.revisionId, decision, ownerMessage, internalNotes, registryChecked, representativeChecked }); }, [adminId, profile.id, profile.revisionId, decision, ownerMessage, internalNotes, registryChecked, representativeChecked, onDraft]);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);
  const decisions: ReviewDecision[] = profile.status === "PendingVerification" ? ["Verify", "Reject"] : profile.status === "Verified" ? ["Suspend"] : ["Reopen"];
  const valid = decision && decisions.includes(decision) && (decision === "Verify" ? registryChecked && representativeChecked && internalNotes.trim().length >= 10 : ownerMessage.trim().length >= 2);
  function resetChecks() { setDecision(""); setConfirm(false); setRegistryChecked(false); setRepresentativeChecked(false); }
  async function run(job: (signal: AbortSignal) => Promise<void>) {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError(null); setNotice("");
    try { await job(controller.signal); } catch (e) { if (!controller.signal.aborted) { setError(e); if (denied(e)) { setLost(true); onDraft(null); } } }
    finally { if (!controller.signal.aborted) { pending.current = null; setBusy(false); } }
  }
  function submit() {
    if (!valid || !confirm || !decision || blocked) return;
    void run(async (signal) => {
      try {
        const result = await reviewBusiness(profile.id, { expectedRevisionId: profile.revisionId, decision, ownerMessage: ownerMessage.trim(), internalNotes: internalNotes.trim(), registryChecked, representativeChecked }, signal);
        if (signal.aborted) return;
        setProfile(result); resetChecks(); setOwnerMessage(""); setInternalNotes(""); setNotice("החלטת הבדיקה נשמרה.");
      } catch (e) {
        if (signal.aborted) return;
        setConfirm(false);
        if (uncertain(e)) { setBlocked(true); setNotice("לא ידוע אם ההחלטה נשמרה. יש לבדוק את המצב העדכני לפני החלטה נוספת. לא נשלח שוב באופן אוטומטי."); }
        else if (e instanceof MovelyApiError && (e.status === 409 || e.errorCode === "INVALID_BUSINESS_STATE")) setBlocked(true);
        throw e;
      }
    });
  }
  if (lost) return <BusinessError error={error} />;
  return <div className="max-w-4xl space-y-6"><BusinessSummary profile={profile} /><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">בעל החשבון</h2><p className="mt-3 break-words">{profile.owner.name}</p><p dir="ltr" className="text-start">{profile.owner.phone || "לא נמסר טלפון"}</p><p>{profile.owner.phoneVerified ? "הטלפון אומת בחשבון" : "הטלפון טרם אומת"} · {profile.owner.status === "Active" ? "חשבון פעיל" : "חשבון מושעה"}</p></section>
    {error ? <BusinessError error={error} /> : null}{notice ? <p role="status" className="rounded-xl bg-sky-50 p-4 leading-7">{notice}</p> : null}
    {blocked ? <button type="button" className="button button-secondary" disabled={busy} onClick={() => void run(async (signal) => { const value = await getAdminBusiness(profile.id, signal); if (signal.aborted) return; setProfile(value); setBlocked(false); resetChecks(); setNotice("הפרטים והמצב העדכניים נטענו. בדקו אותם מחדש ובחרו החלטה; הטקסט שכתבתם נשמר."); })}>בדיקת המצב העדכני</button> : null}
    <form className="space-y-5 rounded-xl border border-slate-200 bg-white p-5" onSubmit={(e) => { e.preventDefault(); if (valid && !blocked) setConfirm(true); }}><fieldset disabled={busy || blocked} className="space-y-5"><legend className="mb-4 text-xl font-bold">בדיקה ידנית והחלטה</legend><p className="leading-7">הטופס אינו בודק רישום עסק או סמכות ייצוג באופן אוטומטי. יש לבצע את הבדיקות ולתעד את מקורות הבדיקה לפני אישור.</p>
      <label className="field-label">החלטה<select required className="field-control" value={decision} onChange={(e) => { setDecision(e.target.value as ReviewDecision); setConfirm(false); }}><option value="">בחרו החלטה</option>{decisions.map((d) => <option key={d} value={d}>{decisionLabels[d]}</option>)}</select></label>
      <label className="field-label">הודעה לבעל העסק<textarea className="field-control min-h-28" value={ownerMessage} maxLength={1000} required={!!decision && decision !== "Verify"} minLength={decision && decision !== "Verify" ? 2 : undefined} onChange={(e) => { setOwnerMessage(e.target.value); setConfirm(false); }} /><span className="text-sm font-normal leading-6">ההודעה תוצג לבעל העסק. לתיקונים, השעיה או פתיחה מחדש יש להסביר את הסיבה ואת הצעד הבא.</span></label>
      <label className="field-label">תיעוד פנימי של הבדיקה<textarea className="field-control min-h-28" value={internalNotes} maxLength={1000} required={decision === "Verify"} minLength={decision === "Verify" ? 10 : undefined} onChange={(e) => { setInternalNotes(e.target.value); setConfirm(false); }} /><span className="text-sm font-normal">למנהלי האתר בלבד. באישור עסק: לפחות 10 תווים המתעדים את הבדיקה והמקורות.</span></label>
      {decision === "Verify" ? <div className="space-y-3"><label className="flex min-h-11 items-start gap-3 leading-7"><input type="checkbox" className="mt-1.5 size-5 shrink-0" checked={registryChecked} onChange={(e) => { setRegistryChecked(e.target.checked); setConfirm(false); }} required />בדקתי את רישום העסק ואת התאמת פרטי הרישום.</label><label className="flex min-h-11 items-start gap-3 leading-7"><input type="checkbox" className="mt-1.5 size-5 shrink-0" checked={representativeChecked} onChange={(e) => { setRepresentativeChecked(e.target.checked); setConfirm(false); }} required />בדקתי שהנציג מורשה לייצג את העסק.</label></div> : null}
      {!confirm ? <button type="submit" className="button button-primary" disabled={!valid}>בדיקת ההחלטה לפני שמירה</button> : <section role="group" aria-label="אישור החלטת הבדיקה" className="rounded-xl border border-amber-300 bg-amber-50 p-4"><h3 className="font-bold">{decision ? decisionLabels[decision] : ""}</h3><p className="mt-2 leading-7">ההחלטה תירשם ביומן הבדיקות ותשנה את מצב העסק. אישור מאפשר גישה לקטלוג; השעיה עוצרת את הגישה. הודעה לבעל העסק תופיע בפרופיל שלו.</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" className="button button-primary" disabled={busy} onClick={submit}>{busy ? "שומרים החלטה…" : "אישור ושמירת ההחלטה"}</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => setConfirm(false)}>חזרה לעריכת ההחלטה</button></div></section>}
    </fieldset></form>
    {profile.hasMoreReviews ? <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6">מוצגות 100 הבדיקות האחרונות. קיימות החלטות קודמות שנשמרו ביומן ואינן מוצגות במסך הזה.</p> : null}
    <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">היסטוריית בדיקות</h2>{profile.reviews.length ? <ol className="mt-4 space-y-4">{profile.reviews.map((review) => <li className="rounded-lg border border-slate-200 p-4" key={review.id}><p className="font-bold">{businessStatusLabels[review.previousStatus]} ← {businessStatusLabels[review.status]}</p><p className="mt-2 text-sm text-slate-600">{new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jerusalem" }).format(new Date(review.reviewedAt))}</p><p className="mt-2 break-all text-sm" dir="ltr">{review.reviewedByUserId}</p><p className="mt-2 whitespace-pre-wrap break-words">הודעה לבעל העסק: {review.ownerMessage || "לא נכתבה הודעה"}</p><p className="mt-2 whitespace-pre-wrap break-words">תיעוד פנימי: {review.internalNotes || "לא נכתב תיעוד"}</p><p className="mt-2 text-sm">בדיקת רישום: {review.registryChecked ? "אושרה" : "לא אושרה"} · בדיקת נציג: {review.representativeChecked ? "אושרה" : "לא אושרה"}</p></li>)}</ol> : <p className="mt-4">אין עדיין החלטות בדיקה.</p>}</section>
  </div>;
}
