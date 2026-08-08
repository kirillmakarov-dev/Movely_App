import type { Metadata } from "next";
import CustomerRequestFlow from "@/features/request-flow/CustomerRequestFlow";

export const metadata: Metadata = { title: "Create Request" };

export default function NewRequestPage() {
  return <CustomerRequestFlow />;
}
