import type { Metadata } from "next";
import SupportRequestDetails from "@/features/support/SupportRequestDetails";
import { parseSupportSearch } from "@/lib/support-api";
export const metadata: Metadata = { title: "טיפול בפנייה", robots: { index: false, follow: false } };
export default async function AdminSupportDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { search, invalid } = parseSupportSearch({ page: query.page });
  return <SupportRequestDetails key={id} audience="admin" requestId={id} historyPage={invalid ? 0 : search.page} />;
}
