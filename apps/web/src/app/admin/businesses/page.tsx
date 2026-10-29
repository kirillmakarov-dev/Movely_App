import type { Metadata } from "next";
import AdminBusinesses from "@/features/businesses/AdminBusinesses";
import { parseBusinessSearch } from "@/lib/business-api";
export const metadata: Metadata = { title: "בדיקת עסקים" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <div className="space-y-6"><h1 className="text-3xl font-bold">בדיקת עסקים</h1><AdminBusinesses search={parseBusinessSearch(await searchParams)} /></div>; }
