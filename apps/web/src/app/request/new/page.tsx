import type { Metadata } from "next";
import CustomerRequestFlow from "@/features/request-flow/CustomerRequestFlow";

export const metadata: Metadata = { title: "יצירת בקשה" };

export default function NewRequestPage() {
  return <CustomerRequestFlow />;
}
