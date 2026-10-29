"use client";

import Link from "@/components/SafeLink";
import { LEGAL_DRAFT_VERSION } from "@/lib/legal-content";

export type PolicyChoice = { adultConfirmed: boolean; acceptTerms: boolean };
export const emptyPolicyChoice: PolicyChoice = { adultConfirmed: false, acceptTerms: false };
export const policyPayload = (choice: PolicyChoice) => ({
  ...choice, termsVersion: LEGAL_DRAFT_VERSION, privacyVersion: LEGAL_DRAFT_VERSION,
});

export default function PolicyConsentFields({ value, onChange, disabled = false }: {
  value: PolicyChoice; onChange: (value: PolicyChoice) => void; disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="my-5 space-y-3 rounded-2xl border border-slate-300 bg-white p-4 text-base leading-7">
      <legend className="px-2 font-bold">אישורי החשבון</legend>
      <p className="text-sm text-amber-900">גרסת בדיקה: המסמכים עדיין טיוטות. הרשמה לציבור תיפתח רק לאחר אישורם.</p>
      <label className="flex min-h-12 cursor-pointer items-start gap-3 py-2">
        <input type="checkbox" checked={value.adultConfirmed} onChange={(event) => onChange({ ...value, adultConfirmed: event.target.checked })} className="mt-1.5 size-5 shrink-0 accent-slate-950" />
        <span>אני בן / בת 18 ומעלה.</span>
      </label>
      <p>קראו את <Link className="font-semibold underline" href="/terms" target="_blank" rel="noopener">תנאי השימוש</Link> ואת <Link className="font-semibold underline" href="/privacy" target="_blank" rel="noopener">הודעת הפרטיות</Link> (נפתחים בלשונית חדשה). אין צורך בתאריך לידה.</p>
      <label className="flex min-h-12 cursor-pointer items-start gap-3 py-2">
        <input type="checkbox" checked={value.acceptTerms} onChange={(event) => onChange({ ...value, acceptTerms: event.target.checked })} className="mt-1.5 size-5 shrink-0 accent-slate-950" />
        <span>אני מסכים / מסכימה לתנאי השימוש וקראתי את הודעת הפרטיות.</span>
      </label>
      <p className="text-sm text-slate-600">אפשר לעיין באתר בלי להסכים. ליצירת חשבון נדרשים שני האישורים. אין כאן הסכמה לדיוור שיווקי.</p>
    </fieldset>
  );
}
