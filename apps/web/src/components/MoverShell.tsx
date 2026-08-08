import Link from "@/components/SafeLink";

const navigation = [
  ["/mover", "Dashboard"],
  ["/mover/requests", "Marketplace"],
  ["/mover/leads", "Purchased Leads"],
  ["/mover/offers", "Offers"],
  ["/mover/wallet", "Wallet"],
  ["/mover/premium", "Premium"],
  ["/mover/profile", "Business Profile"],
];

export default function MoverShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-100 lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden bg-slate-950 p-6 text-white lg:flex lg:flex-col">
        <Link href="/" className="brand-mark">MOVELY</Link>
        <p className="mt-2 text-xs font-bold uppercase tracking-widest text-sky-300">Mover Business</p>
        <nav className="mt-10 grid gap-1" aria-label="Mover business navigation">
          {navigation.map(([href, label]) => (
            <Link key={href} href={href} className="min-h-12 rounded-lg px-4 py-3 font-bold text-slate-300 transition hover:bg-slate-800 hover:text-white">
              {label}
            </Link>
          ))}
        </nav>
        <Link href="/for-movers" className="mt-auto text-sm text-slate-400 hover:text-white">Back to mover overview</Link>
      </aside>

      <div className="min-w-0">
        <header className="flex min-h-18 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-10">
          <div className="lg:hidden">
            <Link href="/" className="brand-mark">MOVELY</Link>
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-700">Mover Business</p>
          </div>
          <p className="hidden text-sm text-slate-500 lg:block">Business workspace preview</p>
          <Link href="/auth" className="button button-ghost">Login</Link>
        </header>
        <main id="main-content" className="px-4 py-8 pb-24 sm:px-6 lg:px-10 lg:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Mover mobile navigation">
        {[
          ["/mover", "Home"],
          ["/mover/requests", "Requests"],
          ["/mover/leads", "Leads"],
          ["/mover/profile", "Profile"],
        ].map(([href, label]) => <Link key={href} href={href} className="flex min-h-16 items-center justify-center text-xs font-bold text-slate-700">{label}</Link>)}
      </nav>
    </div>
  );
}
