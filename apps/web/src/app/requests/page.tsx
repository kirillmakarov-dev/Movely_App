import type { Metadata } from "next";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import MarketplaceBrowser from "@/features/marketplace/MarketplaceBrowser";

export const metadata: Metadata = { title: "Moving Requests" };

export default function RequestsPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <header className="page-hero">
          <div className="site-container">
            <p className="eyebrow">Movely marketplace</p>
            <h1 className="page-title">Moving Requests</h1>
            <p className="page-lead">Browse apartment moves and individual item transport requests. Customer contact details remain protected.</p>
          </div>
        </header>
        <section className="section-block pt-10!">
          <div className="site-container">
            <div className="mb-6 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Preview marketplace data is shown while the Phase 5 discovery API is being prepared.
            </div>
            <MarketplaceBrowser />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
