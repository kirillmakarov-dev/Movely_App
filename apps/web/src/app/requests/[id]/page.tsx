import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import MarketplaceDetails from "@/features/marketplace/MarketplaceDetails";
import { parseMarketplaceFilters } from "@/lib/marketplace-api";
export const metadata: Metadata = { title: "פרטי בקשת הובלה", robots: { index: false, follow: false } };
export default async function RequestDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  return <><SiteHeader /><main id="main-content" className="site-container py-10"><h1 className="page-title mb-7">פרטי בקשת הובלה</h1><MarketplaceDetails requestId={id} filters={parseMarketplaceFilters(search)} fromMover={search.from === "mover"} /></main><SiteFooter /></>;
}
