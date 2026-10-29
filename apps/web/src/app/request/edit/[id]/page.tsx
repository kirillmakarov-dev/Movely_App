import type { Metadata } from "next";
import CustomerRequestFlow from "@/features/request-flow/CustomerRequestFlow";

export const metadata: Metadata = { title: "עריכת בקשה", robots: { index: false, follow: false } };

export default async function EditRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerRequestFlow key={id} mode="published-edit" initialRequestId={id} />;
}
