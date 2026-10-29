"use client";
import { useEffect, useRef, useState } from "react";
import Link from "@/components/SafeLink";
import { MovelyApiError, type MoveRequestStatus } from "@/lib/movely-api";
import { LEGAL_DRAFT_VERSION } from "@/lib/legal-content";
import { getRequestPublicationStatus, renewRequestContactSharing, type RequestPublicationStatus, type PublicationBlocker } from "@/lib/request-publication-api";

const blockerCopy: Record<PublicationBlocker, string> = {
  REQUEST_NOT_ACTIVE: "הבקשה אינה פעילה. טיוטה דורשת השלמה ופרסום; בקשה שנסגרה או בוטלה אינה חוזרת לקטלוג באמצעות אישור נוסף.",
  SALES_UNAVAILABLE: "מצב הבקשה אינו מאפשר כרגע הצגה בקטלוג.",
  PUBLICATION_MISSING: "הפרסום של הבקשה לא הושלם.",
  RECIPIENT_LIMIT_INVALID: "מגבלת העסקים לבקשה אינה תקינה, ולכן אי אפשר לאשר כעת העברת פרטים.",
  CUSTOMER_NOT_ELIGIBLE: "מצב החשבון אינו מאפשר כרגע הצגת בקשות בקטלוג.",
  PHONE_NOT_VERIFIED: "מספר הטלפון בחשבון עדיין לא אומת.",
  POLICY_ACCEPTANCE_REQUIRED: "נדרש אישור תנאי השימוש והודעת הפרטיות המעודכנים בחשבון.",
  LEGAL_NOT_READY: "הפרסום לציבור עדיין אינו פתוח. אין צורך לאשר שוב עד שהמסמכים והאפשרות לפרסם יהיו זמינים.",
  REQUEST_VERSION_INVALID: "הגרסה השמורה של הבקשה אינה זמינה לפרסום. יש לרענן ולבדוק את הפרטים.",
  MOVE_DATE_INVALID: "תאריך ההובלה עבר או אינו תקין.",
  REQUEST_INCOMPLETE: "פרטי ההובלה השמורים אינם מלאים או אינם תקינים.",
  CONTACT_SHARING_REQUIRED: "נדרש אישור עדכני להעברת פרטי קשר וכתובות עבור הגרסה הנוכחית של הבקשה.",
  CONTACT_SHARING_HISTORY_CONFLICT: "לא ניתן לחדש כרגע את האישור עבור הבקשה הזאת. אישור חוזר לא יפתור את מצב הרישום.",
};
type Props = { requestId: string; reviewedVersionId: string | null; requestStatus: MoveRequestStatus; disabled?: boolean; onRefreshRequest: () => void; onAccessDenied: (status: number) => void; onBusyChange?: (busy: boolean) => void };
type LoadState = { attempt: number } & ({ kind: "loading" } | { kind: "ready"; data: RequestPublicationStatus } | { kind: "error"; error: unknown });
function isDenied(error: unknown) { return error instanceof MovelyApiError && (error.status === 401 || error.status === 404 || (error.status === 403 && !["PHONE_NOT_VERIFIED", "POLICY_ACCEPTANCE_REQUIRED"].includes(error.errorCode))); }
function publicationTime(value: string) { return new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jerusalem" }).format(new Date(value)); }
function errorCopy(error: unknown) {
  if (!(error instanceof MovelyApiError)) return "לא התקבלה תשובה. בדקו את מצב הבקשה לפני ניסיון נוסף.";
  if (error.status === 429) return "נשלחו יותר מדי בקשות. המתינו כמה דקות לפני בדיקה נוספת.";
  if (error.errorCode === "CONTACT_SHARING_HISTORY_CONFLICT") return blockerCopy.CONTACT_SHARING_HISTORY_CONFLICT;
  if (error.errorCode === "LEGAL_NOT_READY") return blockerCopy.LEGAL_NOT_READY;
  if (["REQUEST_VERSION_CONFLICT", "POLICY_VERSION_CHANGED", "RECIPIENT_LIMIT_CHANGED", "PUBLICATION_RENEWAL_UNAVAILABLE"].includes(error.errorCode)) return "הפרטים, הנוסח או מצב הבקשה השתנו. טענו את מצב הבקשה מחדש ובדקו את הפרטים לפני אישור נוסף.";
  if (error.errorCode === "PHONE_NOT_VERIFIED") return blockerCopy.PHONE_NOT_VERIFIED;
  if (error.errorCode === "POLICY_ACCEPTANCE_REQUIRED") return blockerCopy.POLICY_ACCEPTANCE_REQUIRED;
  if (error.errorCode === "PUBLICATION_STATUS_TIMEOUT") return "בדיקת מצב הפרסום נמשכת זמן רב מדי. אפשר לנסות שוב.";
  return "לא ניתן להשלים את בדיקת הפרסום כרגע. בדקו שוב את מצב הבקשה.";
}
export default function PublicationStatus(props: Props) {
  const { requestId, reviewedVersionId, requestStatus, onAccessDenied } = props;
  const [attempt, setAttempt] = useState(0); const [state, setState] = useState<LoadState>({ kind: "loading", attempt: 0 }); const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const view: LoadState = state.attempt === attempt ? state : { kind: "loading", attempt };
  useEffect(() => {
    const controller = new AbortController(); let active = true; let settled = false;
    const timeout = setTimeout(() => { if (!active || settled) return; settled = true; controller.abort(); setState({ kind: "error", attempt, error: new MovelyApiError("", { status: 0, errorCode: "PUBLICATION_STATUS_TIMEOUT" }) }); }, 10_000);
    void getRequestPublicationStatus(requestId, controller.signal).then((data) => { if (active && !settled) { settled = true; clearTimeout(timeout); setState({ kind: "ready", attempt, data }); } }).catch((error: unknown) => {
      if (!active || settled) return; settled = true; clearTimeout(timeout);
      if (isDenied(error)) onAccessDenied((error as MovelyApiError).status);
      setState({ kind: "error", attempt, error });
    });
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [requestId, attempt, onAccessDenied]);
  useEffect(() => { if (notice) heading.current?.focus(); }, [notice]);
  const refresh = () => { setNotice(""); setAttempt((v) => v + 1); };
  const data = view.kind === "ready" ? view.data : null;
  const matchesReviewedRequest = data && data.currentVersionId?.toLowerCase() === reviewedVersionId?.toLowerCase() && data.requestStatus === requestStatus;
  const knownDisclosure = data?.disclosureVersion === LEGAL_DRAFT_VERSION && data.isTestOnly === LEGAL_DRAFT_VERSION.startsWith("draft-");
  const activeRequest = data?.requestStatus === "Active";
  const legalClosed = data?.blockers.includes("LEGAL_NOT_READY");
  const displayedBlockers = activeRequest ? legalClosed ? ["LEGAL_NOT_READY" as const] : data.blockers : legalClosed && data?.requestStatus === "Draft" ? ["LEGAL_NOT_READY" as const] : [];
  const needsAccount = activeRequest && !legalClosed && data?.blockers.some((b) => ["PHONE_NOT_VERIFIED", "POLICY_ACCEPTANCE_REQUIRED", "CUSTOMER_NOT_ELIGIBLE"].includes(b));
  const lifecycleCopy: Partial<Record<MoveRequestStatus, string>> = {
    Draft: "הבקשה שמורה כטיוטה פרטית ואינה מוצגת בקטלוג. אפשר להמשיך לערוך ולבחור אם לפרסם בהמשך.",
    Closed: "חיפוש המוביל הסתיים והבקשה סגורה. היא אינה מוצגת בקטלוג; אישור נוסף אינו פותח אותה מחדש.",
    Cancelled: "הבקשה בוטלה ואינה מוצגת בקטלוג. אישור נוסף אינו מחזיר אותה למצב פעיל.",
    Expired: "תוקף הבקשה פג והיא אינה מוצגת בקטלוג. אם עדיין נדרשת הובלה, אפשר ליצור בקשה חדשה עם מועד מתאים.",
    Published: "הבקשה נמצאת במצב פרסום קודם, אך אינה פעילה בקטלוג. אישור העברת פרטים לבדו אינו מעביר אותה למצב פעיל.",
  };
  return <section aria-labelledby="publication-status-heading" className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <h2 id="publication-status-heading" ref={heading} tabIndex={-1} className="text-xl font-bold">מצב הפרסום</h2>
    {view.kind === "loading" ? <p role="status" className="mt-4">בודקים את מצב הפרסום…</p> : view.kind === "error" ? <div role="alert" className="mt-4"><p className="leading-7">{errorCopy(view.error)}</p><button type="button" className="button button-secondary mt-4" onClick={refresh}>בדיקת הפרסום מחדש</button></div> : data ? <div className="mt-4 space-y-4">
      {notice ? <p role="status" className="rounded-lg bg-teal-50 p-4 leading-7">{notice}</p> : null}
      <p className="font-bold leading-7">{lifecycleCopy[data.requestStatus] ?? (data.eligibleForMarketplace ? "לפי הנתונים בעת הבדיקה, הבקשה יכולה להופיע בקטלוג למובילים מאומתים העומדים בתנאי הגישה." : "בעת הבדיקה, הבקשה לא הייתה כשירה להצגה בקטלוג.")}</p>
      <p className="text-base leading-7 text-slate-600">מצב הפרסום נבדק: <time dateTime={data.checkedAt}>{publicationTime(data.checkedAt)}</time> (שעון ישראל)</p>
      {data.isTestOnly ? <p className="text-sm leading-6 text-slate-600">מסמכי האישור עדיין מסומנים כטיוטה. אישורים בנוסח הזה מיועדים לצורכי בדיקה בלבד.</p> : null}
      {displayedBlockers.length ? <ul className="list-inside list-disc space-y-2 leading-7">{displayedBlockers.map((blocker) => <li key={blocker}>{blockerCopy[blocker]}</li>)}</ul> : null}
      {data.hasCurrentContactSharing ? <p className="leading-7">קיים אישור עדכני להעברת פרטים עבור הגרסה הזאת.</p> : null}
      {data.hasCurrentContactSharing && data.contactSharingAcceptedAt ? <p className="text-base leading-7 text-slate-600">האישור לגרסה זו נשמר: <time dateTime={data.contactSharingAcceptedAt}>{publicationTime(data.contactSharingAcceptedAt)}</time> (שעון ישראל)</p> : null}
      <p className="text-sm leading-6 text-slate-600">הבדיקה משקפת את המצב במועד שצוין ואינה מבטיחה שהבקשה נצפתה או שתתקבל הצעה. רכישת גישה לפרטי קשר דרך האתר עדיין אינה זמינה.</p>
      {needsAccount ? <a href="/auth" target="_blank" rel="noopener noreferrer" className="button button-primary">אימות טלפון ואישור תנאים בחשבון (לשונית חדשה)</a> : null}
      {data.requestStatus === "Draft" ? <Link href={`/request/new?requestId=${encodeURIComponent(requestId)}`} className="button button-secondary">השלמת הטיוטה לקראת פרסום</Link> : null}
      {activeRequest && !legalClosed && data.blockers.some((b) => ["MOVE_DATE_INVALID", "REQUEST_INCOMPLETE"].includes(b)) ? <p className="leading-7">עריכת תוכן של בקשה פעילה עדיין אינה זמינה. בדקו את הפרטים למטה; אם אינם מתאימים, אפשר לסיים את החיפוש וליצור בקשה חדשה עם הפרטים הנכונים.</p> : null}
      {!matchesReviewedRequest ? <div role="alert"><p className="leading-7">פרטי הבקשה השתנו מאז שהוצגו. רעננו את פרטי הבקשה ובדקו את הגרסה העדכנית לפני אישור.</p><button className="button button-secondary mt-3" type="button" onClick={props.onRefreshRequest}>רענון פרטי הבקשה</button></div> : activeRequest && !legalClosed && data.canRenewContactSharing && !knownDisclosure ? <div role="alert"><p>נוסח האישור עודכן. רעננו את העמוד כדי לקרוא את הנוסח העדכני לפני אישור.</p><a className="button button-secondary mt-3" href={`/account/requests/${encodeURIComponent(requestId)}`}>טעינת העמוד המעודכן</a></div> : activeRequest && !legalClosed && data.canRenewContactSharing && knownDisclosure ? <SharingConfirmation key={`${data.currentVersionId}-${data.disclosureVersion}-${data.maxRecipients}`} data={data} disabled={props.disabled} onBusyChange={props.onBusyChange} onAccessDenied={onAccessDenied} onRefresh={refresh} onRefreshRequest={props.onRefreshRequest} onSaved={(result, alreadyAccepted) => {
        if (result.requestStatus !== requestStatus) { props.onRefreshRequest(); return; }
        setState({ kind: "ready", attempt, data: result }); setNotice(alreadyAccepted ? "האישור העדכני כבר היה שמור. לא נוצר אישור נוסף." : "האישור להעברת הפרטים נשמר עבור הגרסה שבדקתם.");
      }} /> : null}
      <button type="button" className="button button-secondary" disabled={props.disabled} onClick={props.onRefreshRequest}>בדיקת מצב הבקשה מחדש</button>
    </div> : null}
  </section>;
}
function SharingConfirmation({ data, disabled, onBusyChange, onAccessDenied, onRefresh, onRefreshRequest, onSaved }: { data: RequestPublicationStatus; disabled?: boolean; onBusyChange?: (busy: boolean) => void; onAccessDenied: (status: number) => void; onRefresh: () => void; onRefreshRequest: () => void; onSaved: (data: RequestPublicationStatus, alreadyAccepted: boolean) => void }) {
  const [checked, setChecked] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [uncertain, setUncertain] = useState(false); const [blocked, setBlocked] = useState(false);
  const pending = useRef<AbortController | null>(null); const errorHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => { pending.current?.abort(); onBusyChange?.(false); }, [onBusyChange]);
  useEffect(() => { if (error) errorHeading.current?.focus(); }, [error]);
  async function confirm() {
    if (!checked || disabled || blocked || pending.current || !data.currentVersionId) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); onBusyChange?.(true); setError(null);
    try {
      const result = await renewRequestContactSharing(data.requestId, { expectedCurrentVersionId: data.currentVersionId, contactSharing: { shareContacts: true, disclosureVersion: data.disclosureVersion, maxRecipients: data.maxRecipients } }, controller.signal);
      if (!controller.signal.aborted) onSaved(result.publicationStatus, result.alreadyAccepted);
    } catch (e) {
      if (controller.signal.aborted) return;
      setChecked(false); setError(e); setBlocked(true);
      setUncertain(!(e instanceof MovelyApiError) || e.status === 0 || e.status >= 500);
      if (isDenied(e)) onAccessDenied((e as MovelyApiError).status);
    } finally {
      if (!controller.signal.aborted) { pending.current = null; setBusy(false); onBusyChange?.(false); }
    }
  }
  return <div className="space-y-4 rounded-xl border border-sky-200 bg-sky-50 p-4 sm:p-5">
    <h3 className="text-lg font-bold">אישור העברת פרטים לגרסה שבדקתם</h3>
    <p className="leading-7">לאחר הפרסום, עד {data.maxRecipients} עסקים להובלה יוכלו לרכוש גישה לשם, לטלפון ולכתובות המדויקות בבקשה זו כדי ליצור איתכם קשר ולהציע מחיר. הפרטים האלה אינם מוצגים בכרטיס הקטלוג.</p>
    <p className="leading-7">זו אינה הזמנת הובלה ואין התחייבות לקבל הצעה. האישור מתייחס לפרטי הבקשה המוצגים בעמוד הזה; הוא אינו משנה את התכולה או את מועד ההובלה.</p>
    <div className="flex flex-wrap gap-4"><a href="#owned-request-content" className="min-h-11 py-2 underline underline-offset-4">עיון בפרטי הבקשה</a><a href="/privacy" target="_blank" rel="noopener noreferrer" className="min-h-11 py-2 underline underline-offset-4">מדיניות פרטיות (לשונית חדשה)</a><a href="/terms" target="_blank" rel="noopener noreferrer" className="min-h-11 py-2 underline underline-offset-4">תנאי שימוש (לשונית חדשה)</a></div>
    <label className="flex min-h-12 items-start gap-3 py-2 leading-7"><input type="checkbox" className="mt-1.5 size-5 shrink-0" checked={checked} disabled={busy || blocked || disabled} onChange={(e) => setChecked(e.target.checked)} /><span>בדקתי את פרטי הבקשה ואני מאשר/ת העברת שם, טלפון וכתובות לעד {data.maxRecipients} עסקים להובלה עבור גרסה זו.</span></label>
    {error ? <div role="alert"><h3 ref={errorHeading} tabIndex={-1} className="font-bold">{uncertain ? "לא ידוע אם האישור נשמר" : "נדרשת בדיקה לפני אישור נוסף"}</h3><p className="mt-2 leading-7">{uncertain ? "ייתכן שהאישור נשמר למרות שלא התקבלה תשובה. בדקו את המצב בשרת; לא נשלח אותו שוב אוטומטית." : errorCopy(error)}</p><button type="button" className="button button-secondary mt-3" onClick={uncertain ? onRefresh : onRefreshRequest}>{uncertain ? "בדיקת האישור השמור" : "רענון הבקשה לפני אישור נוסף"}</button></div> : null}
    <button type="button" className="button button-primary" disabled={!checked || busy || blocked || disabled} onClick={() => void confirm()}>{busy ? "שומרים את האישור…" : "אישור העברת הפרטים לגרסה זו"}</button>
    <p className="text-sm leading-6">אפשר לבחור לא לאשר. אישור נוסף אינו מוחק פרטים שכבר הועברו ואינו פותח מחדש בקשה שנסגרה.</p>
  </div>;
}
