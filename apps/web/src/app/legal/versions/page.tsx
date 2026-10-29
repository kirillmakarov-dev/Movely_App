import type { Metadata } from "next";
import Link from "@/components/SafeLink";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { LEGAL_DRAFT_VERSION } from "@/lib/legal-content";
import previous from "@/lib/legal-archive/draft-2026-10-29.json";

export const metadata: Metadata = { title: "גרסאות מסמכים", robots: { index: false, follow: true } };

export default function LegalVersionsPage() {
  return <><SiteHeader /><main id="main-content" tabIndex={-1} className="site-container max-w-3xl space-y-6 py-10 text-base leading-7">
    <h1 className="text-3xl font-bold">גרסאות תנאי השימוש ומדיניות הפרטיות</h1>
    <p>כאן אפשר לקרוא את הנוסח העדכני ואת הנוסחים הקודמים. המסמכים עדיין טיוטות לבדיקה; הופעה בארכיון אינה אישור משפטי או הודעה על פתיחת השירות.</p>
    <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">הנוסח העדכני · <bdi>{LEGAL_DRAFT_VERSION}</bdi></h2><p className="mt-3">עדכון ההסבר על פניות אישיות, הרשאות הגישה וההבחנה בין קבלת בקשת פרטיות לביצועה. תנאי השימוש נכללים באותה גרסת מסמכים.</p><div className="mt-4 flex flex-wrap gap-3"><Link href="/privacy" className="button button-secondary">מדיניות פרטיות עדכנית</Link><Link href="/terms" className="button button-secondary">תנאי שימוש עדכניים</Link></div></section>
    <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">גרסה קודמת · <bdi>{previous.version}</bdi></h2><div className="mt-4 flex flex-wrap gap-3"><Link href={`/legal/versions/${previous.version}/privacy`} className="button button-secondary">מדיניות פרטיות קודמת</Link><Link href={`/legal/versions/${previous.version}/terms`} className="button button-secondary">תנאי שימוש קודמים</Link></div></section>
  </main><SiteFooter /></>;
}
