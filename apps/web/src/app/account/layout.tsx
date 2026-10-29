import Link from "@/components/SafeLink";
import SiteHeader from "@/components/SiteHeader";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="min-h-[calc(100vh-72px)]">
        <div className="site-container grid gap-8 py-10 lg:grid-cols-[220px_1fr]">
          <aside>
            <p className="eyebrow">החשבון שלי</p>
            <nav className="mt-5 grid gap-1" aria-label="ניווט החשבון">
              <Link href="/account/requests" className="min-h-12 rounded-lg px-4 py-3 font-bold text-slate-600 hover:bg-white">הבקשות שלי</Link>
              <Link href="/account/support" className="min-h-12 rounded-lg px-4 py-3 font-bold text-slate-600 hover:bg-white">פניות ועזרה אישית</Link>
              <Link href="/auth" className="min-h-12 rounded-lg px-4 py-3 font-bold text-slate-600 hover:bg-white">ניהול הכניסה לחשבון</Link>
              <Link href="/help" className="min-h-12 rounded-lg px-4 py-3 font-bold text-slate-600 hover:bg-white">עזרה</Link>
            </nav>
          </aside>
          <section className="min-w-0">{children}</section>
        </div>
      </main>
    </>
  );
}
