import type { Metadata } from "next";
import Link from "@/components/SafeLink";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = { title: "למובילים" };

const steps = [
  ["01", "עיינו בבקשות רלוונטיות", "חפשו עבודות בטוחות לשוק לפי מסלול, סוג הובלה, תאריך ותקציב."],
  ["02", "בדקו את פרטי ההובלה", "בדקו גישה, תכולה, שירותים ותמונות לפני קבלת החלטה."],
  ["03", "רכשו ליד אם הוא מתאים", "רכישת לידים תחשוף את פרטי הקשר של הלקוח כאשר שלב 5 יהיה זמין."],
  ["04", "צרו קשר עם הלקוח", "המשיכו את השיחה ישירות וסגרו את ההובלה."],
];

export default function ForMoversPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <header className="page-hero bg-slate-950! text-white">
          <div className="site-container grid gap-10 lg:grid-cols-[1fr_380px] lg:items-end">
            <div>
              <p className="eyebrow text-sky-300">נבנה לעסקים בתחום ההובלה</p>
              <h1 className="page-title">פחות זמן על עבודות לא מתאימות.</h1>
              <p className="page-lead text-slate-300!">עיינו בבקשות הובלה מפורטות והתמקדו בעבודות שמתאימות לצוות, לאזור השירות וללוח הזמנים שלכם.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/mover" className="button button-light button-large">יצירת חשבון מוביל</Link>
                <Link href="/auth" className="button button-large border-slate-600 text-white hover:border-sky-300">התחברות כמוביל</Link>
              </div>
            </div>
            <div className="border-l border-slate-700 pl-6">
              <p className="text-sm font-bold uppercase tracking-wider text-sky-300">גבול המוצר</p>
              <p className="mt-3 leading-7 text-slate-300">קליטת מובילים ורכישת לידים עדיין לא פעילים. הדף מציג תצוגה מקדימה של שלב 5 בלי להציג כלים לא זמינים כפעילים.</p>
            </div>
          </div>
        </header>

        <section className="section-block">
          <div className="site-container">
            <div className="section-heading"><p className="eyebrow">תהליך העבודה</p><h2>איך Movely עובד עבור מובילים</h2></div>
            <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 md:grid-cols-2">
              {steps.map(([number, title, copy]) => (
                <li key={number} className="min-h-64 bg-white p-7 list-none">
                  <span className="text-sm font-bold tracking-widest text-sky-700">{number}</span>
                  <h3 className="mt-12 text-2xl font-bold">{title}</h3>
                  <p className="mt-3 max-w-md leading-7 text-slate-600">{copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section-block bg-sky-50">
          <div className="site-container grid gap-8 md:grid-cols-[.7fr_1.3fr]">
            <p className="eyebrow">תצוגת פרימיום</p>
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">הביעו עניין לפני רכישת ליד.</h2>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">מובילי פרימיום יוכלו בהמשך להגיש הצעה לפני רכישת פרטי הקשר ולראות אם הלקוח מעוניין. הצעות פרימיום אינן פעילות בשלב הזה.</p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
