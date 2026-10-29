"use client";

import { useEffect, useRef } from "react";
import Link from "@/components/SafeLink";
import { isEditableStatus } from "@/lib/published-request-api";
import RequestChangeSummary from "./RequestChangeSummary";
import type { PublishedEditor } from "./usePublishedRequestEdit";

export function PublishedEditStatus({ editor }: { editor: PublishedEditor }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (editor.pending || editor.needsRefresh) heading.current?.focus(); }, [editor.pending, editor.needsRefresh]);
  const context = editor.pending ?? editor.context;
  if (!context) return null;
  const closed = !isEditableStatus(context.request.status);
  return <div className="space-y-4 text-base leading-7">
    {(editor.notice || closed) && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4" aria-labelledby="published-edit-state">
      <h3 id="published-edit-state" ref={heading} tabIndex={-1} className="text-lg font-bold">{closed ? "הבקשה אינה פתוחה לעריכה" : editor.pending ? "צריך לבדוק את הגרסה העדכנית" : editor.uncertain ? "צריך לבדוק אם השינוי נשמר" : "מצב העריכה"}</h3>
      <p role="status" className="mt-2">{closed ? "מצב הבקשה השתנה ואי אפשר לשמור בה גרסה חדשה. העריכות המקומיות עדיין מופיעות בעמוד לעיון, אך לא יישלחו לשרת." : editor.notice}</p>
      {editor.needsRefresh && <button type="button" className="button button-secondary mt-3" onClick={editor.refresh}>בדיקת הגרסה בשרת</button>}
      {editor.pending && !closed && <>
        <p className="mt-3">זו גרסת השרת העדכנית לעומת כל הפרטים שבטופס שלכם. המשך עם העריכות שלכם עשוי להחליף שינויים שנשמרו ממקום אחר. הבחירה אינה שומרת דבר.</p>
        <div className="mt-4"><RequestChangeSummary before={editor.pending.request.currentVersion} after={editor.payload} /></div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="button button-secondary" onClick={() => editor.chooseLatest(false)}>להמשיך עם הפרטים שלי לבדיקה מחדש</button>
          <button type="button" className="button button-secondary" onClick={() => editor.chooseLatest(true)}>להחליף את העריכות שלי בגרסת השרת</button>
        </div>
      </>}
      {closed && <Link href={`/account/requests/${context.request.id}`} className="button button-secondary mt-3">צפייה בבקשה שבשרת</Link>}
    </section>}
    {(!editor.accountReady || !editor.legalReady || context.publication.maxRecipients < 1) && <section className="rounded-xl border border-sky-200 bg-sky-50 p-4">
      <h3 className="text-lg font-bold">לפני שמירת השינויים</h3>
      {!context.capabilities.policyAcceptanceAvailable ? <p className="mt-2">השירות עדיין אינו פתוח לשמירת שינויים בבקשה שפורסמה. אפשר לערוך בעמוד, אך העריכות לא יישמרו עד לפתיחת השירות.</p>
        : !editor.legalReady ? <p className="mt-2">נוסח ההסכמה בעמוד אינו תואם לגרסה העדכנית. שמירה נעולה. העתיקו לעצמכם עריכות חשובות לפני טעינה מחדש של העמוד.</p> : null}
      {!context.user.phoneVerified && <p className="mt-2">יש לאמת את מספר הטלפון כדי לשמור גרסה חדשה.</p>}
      {!context.user.hasCurrentPolicyAcceptance && <p className="mt-2">יש לקרוא ולאשר את תנאי השירות ומדיניות הפרטיות העדכניים בחשבון.</p>}
      {context.publication.maxRecipients < 1 && <p className="mt-2">מגבלת מקבלי הפרטים אינה זמינה. אי אפשר לתת הסכמה או לשמור עד לבדיקת המצב מחדש.</p>}
      <div className="mt-3 flex flex-wrap gap-3">
        {!editor.accountReady && <Link href="/auth" target="_blank" rel="noopener noreferrer" className="button button-secondary">השלמת אימות ואישורים (בכרטיסייה חדשה)</Link>}
        <button type="button" disabled={editor.busy} onClick={editor.refresh} className="button button-secondary">בדיקה מחדש לאחר החזרה</button>
      </div>
      <p className="mt-2">העריכות נשארות בזיכרון העמוד בלבד. אל תרעננו ואל תסגרו אותו אם ברצונכם לשמור אותן.</p>
    </section>}
  </div>;
}

export default function PublishedEditReview({ editor }: { editor: PublishedEditor }) {
  const context = editor.context;
  if (!context) return null;
  const max = context.publication.maxRecipients;
  return <div className="space-y-5 text-base leading-7">
    <p className="rounded-xl border border-sky-200 bg-sky-50 p-4">אלה הפרטים שבטופס עכשיו. הם עדיין לא נשמרו. בשמירה, כל תוכן הבקשה יישמר כגרסה חדשה; המצב והיסטוריית הבקשה נשמרים בשרת.</p>
    <RequestChangeSummary before={context.request.currentVersion} after={editor.payload} />
    {editor.categoryChanged && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h3 className="text-lg font-bold">שינוי סוג ההובלה מחליף את התכולה</h3>
      <p className="mt-2">הגרסה החדשה תכלול את פרטי הסוג שנבחר. התכולה והשירותים של הסוג הקודם לא יועתקו אליה. אפשר לחזור לסוג הקודם לפני השמירה; הפרטים שלו נשארו בטופס.</p>
      <label className="mt-3 flex min-h-12 items-start gap-3"><input type="checkbox" className="mt-1.5 size-5 shrink-0 accent-sky-800" checked={editor.categoryAccepted} onChange={(event) => editor.setCategoryAccepted(event.target.checked)} /><span>בדקתי את שינוי הסוג ואת התכולה שתוחלף בגרסה החדשה.</span></label>
    </section>}
    {editor.legalReady && max > 0 && isEditableStatus(context.request.status) && !editor.pending && !editor.needsRefresh && !editor.uncertain && <section className="rounded-xl border border-sky-200 bg-sky-50 p-5">
      <h3 className="text-lg font-bold">אישור חדש להעברת פרטים עבור הגרסה הזאת</h3>
      <p className="mt-2">עד {max} עסקים להובלה יוכלו לקבל גישה לשם, לטלפון ולכתובות המדויקות בבקשה כדי ליצור איתכם קשר ולהציע מחיר. הפרטים האלה לא יוצגו בכרטיס הציבורי.</p>
      <p className="mt-2">זו אינה הזמנת הובלה ואין התחייבות לקבל הצעה. רכישת גישה לפרטי קשר עדיין אינה פעילה. שמירת עריכה אינה מבטלת מידע שכבר נמסר או הסכם נפרד עם מוביל.</p>
      {context.publication.isTestOnly && <p className="mt-2">המסמכים עדיין מסומנים כטיוטה. אישורים לגרסה הזאת מיועדים לבדיקות בלבד; פתיחת השירות תלויה במסמכים מאושרים.</p>}
      <label className="mt-3 flex min-h-12 items-start gap-3"><input type="checkbox" className="mt-1.5 size-5 shrink-0 accent-sky-800" checked={editor.accepted} onChange={(event) => editor.setAccepted(event.target.checked)} /><span>אני מאשר / מאשרת העברת פרטי קשר וכתובות לעד {max} עסקים להובלה עבור הגרסה החדשה שבדקתי.</span></label>
      <p className="mt-2">ללא אישור ושמירה מפורשת, הגרסה שבשרת תישאר ללא שינוי. שינוי נוסף בטופס מבטל את הסימון ומצריך בדיקה ואישור מחדש.</p>
      <div className="mt-2 flex flex-wrap gap-4"><Link href="/terms" target="_blank" rel="noopener noreferrer" className="inline-link">תנאי השימוש (כרטיסייה חדשה)</Link><Link href="/privacy" target="_blank" rel="noopener noreferrer" className="inline-link">מדיניות הפרטיות (כרטיסייה חדשה)</Link></div>
    </section>}
    {!editor.dirty && <p role="status">לא נעשו שינויים בתוכן הבקשה. אין צורך לשמור גרסה נוספת.</p>}
  </div>;
}
