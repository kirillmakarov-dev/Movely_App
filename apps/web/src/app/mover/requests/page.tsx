import type { Metadata } from "next";
import MarketplaceBrowser from "@/features/marketplace/MarketplaceBrowser";
import { parseMarketplaceFilters } from "@/lib/marketplace-api";
export const metadata: Metadata = { title: "בקשות למובילים", robots: { index: false, follow: false } };
export default async function MoverRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <div className="min-w-0 space-y-7"><header><p className="eyebrow">שוק הבקשות למובילים</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">בקשות הובלה</h1><p className="mt-3 max-w-2xl leading-7 text-slate-700">חפשו בקשות לפי מסלול, תאריך וסוג ההובלה. פרטי הקשר והכתובות המדויקות אינם מוצגים כאן.</p></header><MarketplaceBrowser filters={parseMarketplaceFilters(await searchParams)} basePath="/mover/requests" /></div>;
}
