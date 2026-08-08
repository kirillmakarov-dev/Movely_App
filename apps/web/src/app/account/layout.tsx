import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="min-h-[calc(100vh-72px)]">
        <div className="site-container grid gap-8 py-10 lg:grid-cols-[220px_1fr]">
          <aside>
            <p className="eyebrow">Customer account</p>
            <nav className="mt-5 grid gap-1" aria-label="Customer account navigation">
              <Link href="/account/requests" className="min-h-12 rounded-lg bg-slate-900 px-4 py-3 font-bold text-white">My Requests</Link>
              <Link href="/account/requests" className="min-h-12 rounded-lg px-4 py-3 font-bold text-slate-600 hover:bg-white">Drafts</Link>
              <span className="min-h-12 rounded-lg px-4 py-3 font-bold text-slate-400" aria-disabled="true">Profile - Coming Later</span>
            </nav>
          </aside>
          <section>{children}</section>
        </div>
      </main>
    </>
  );
}
