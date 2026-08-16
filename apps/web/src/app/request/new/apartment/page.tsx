import type { Metadata } from "next";
import CustomerRequestFlow from "@/features/request-flow/CustomerRequestFlow";

export const metadata: Metadata = { title: "יצירת הובלת דירה" };

export default function NewApartmentMovePage() {
  return <CustomerRequestFlow initialRequestType="ApartmentMove" />;
}
