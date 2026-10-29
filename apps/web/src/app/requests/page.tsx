import type { Metadata } from "next";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import MarketplaceBrowser from "@/features/marketplace/MarketplaceBrowser";
import { parseMarketplaceFilters } from "@/lib/marketplace-api";

export const metadata: Metadata = { title: "בקשות הובלה", robots: { index: false, follow: false } };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseMarketplaceFilters(await searchParams);
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <header className="page-hero">
          <div className="site-container">
            <p className="eyebrow">שוק Movely</p>
            <h1 className="page-title">בקשות הובלה</h1>
            <p className="page-lead">בקשות להובלת דירות ופריטים בודדים למובילים עם עסק מאומת. פרטי הקשר והכתובות המדויקות אינם מוצגים כאן.</p>
          </div>
        </header>
        <section className="section-block pt-10!">
          <div className="site-container">
            <MarketplaceBrowser filters={filters} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
