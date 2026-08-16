import type { Metadata } from "next";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import MarketplaceBrowser from "@/features/marketplace/MarketplaceBrowser";

export const metadata: Metadata = { title: "בקשות הובלה" };

export default function RequestsPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content">
        <header className="page-hero">
          <div className="site-container">
            <p className="eyebrow">שוק Movely</p>
            <h1 className="page-title">בקשות הובלה</h1>
            <p className="page-lead">עיינו בבקשות להובלת דירות והעברת פריטים בודדים. פרטי הקשר של הלקוחות נשמרים מוגנים.</p>
          </div>
        </header>
        <section className="section-block pt-10!">
          <div className="site-container">
            <div className="mb-6 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              נתוני שוק לדוגמה מוצגים בזמן שממשק החיפוש של שלב 5 עדיין בהכנה.
            </div>
            <MarketplaceBrowser />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
