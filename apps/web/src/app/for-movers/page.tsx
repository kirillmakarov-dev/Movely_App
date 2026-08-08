import type { Metadata } from "next";
import Link from "@/components/SafeLink";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = { title: "For Movers" };

const steps = [
  ["01", "Browse relevant requests", "Search marketplace-safe jobs by route, move type, date and budget."],
  ["02", "Review move details", "Check access, inventory, services and photos before making a decision."],
  ["03", "Buy the lead if it fits", "Lead purchasing will unlock customer contact details when Phase 5 is available."],
  ["04", "Contact the customer", "Continue the conversation directly and agree on the move."],
];

export default function ForMoversPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <header className="page-hero bg-slate-950! text-white">
          <div className="site-container grid gap-10 lg:grid-cols-[1fr_380px] lg:items-end">
            <div>
              <p className="eyebrow text-sky-300">Built for moving businesses</p>
              <h1 className="page-title">Spend less time chasing the wrong jobs.</h1>
              <p className="page-lead text-slate-300!">Browse detailed moving requests and focus your time on jobs that match your team, service area and schedule.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/mover" className="button button-light button-large">Create Mover Account</Link>
                <Link href="/auth" className="button button-large border-slate-600 text-white hover:border-sky-300">Login as Mover</Link>
              </div>
            </div>
            <div className="border-l border-slate-700 pl-6">
              <p className="text-sm font-bold uppercase tracking-wider text-sky-300">Product boundary</p>
              <p className="mt-3 leading-7 text-slate-300">Mover onboarding and lead purchasing are not active yet. This page previews the Phase 5 experience without presenting unavailable tools as operational.</p>
            </div>
          </div>
        </header>

        <section className="section-block">
          <div className="site-container">
            <div className="section-heading"><p className="eyebrow">The workflow</p><h2>How Movely works for movers</h2></div>
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
            <p className="eyebrow">Premium preview</p>
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Show interest before purchasing a lead.</h2>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">Premium movers may later submit an offer before buying contact information and see whether the customer is interested. Premium offers are not active in this phase.</p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
