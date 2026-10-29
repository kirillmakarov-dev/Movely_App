import type { Metadata } from "next";
import SupportRequests from "@/features/support/SupportRequests";
import { parseSupportSearch } from "@/lib/support-api";
export const metadata: Metadata = { title: "ניהול פניות", robots: { index: false, follow: false } };
export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { search, invalid } = parseSupportSearch(await searchParams);
  return <SupportRequests key={JSON.stringify(search)} audience="admin" search={search} invalid={invalid} />;
}
