import type { Metadata } from "next";
import CustomerRequestFlow from "@/features/request-flow/CustomerRequestFlow";

export const metadata: Metadata = { title: "יצירת הובלה קטנה" };

export default function NewSmallMovePage() {
  return <CustomerRequestFlow initialRequestType="SmallMove" />;
}
