import type { Metadata } from "next";
import CustomerRequestFlow from "@/features/request-flow/CustomerRequestFlow";

export const metadata: Metadata = { title: "יצירת בקשה" };

export default async function NewRequestPage({ searchParams }: {
  searchParams: Promise<{ requestId?: string | string[] }>;
}) {
  const { requestId } = await searchParams;
  // An empty or repeated parameter is an invalid resume link, never a new request.
  const initialRequestId = requestId === undefined ? null : typeof requestId === "string" ? requestId : "";
  return <CustomerRequestFlow key={initialRequestId ?? "new"} initialRequestId={initialRequestId} />;
}
