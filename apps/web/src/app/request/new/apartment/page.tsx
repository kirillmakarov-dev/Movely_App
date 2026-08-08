import type { Metadata } from "next";
import CustomerRequestFlow from "@/features/request-flow/CustomerRequestFlow";

export const metadata: Metadata = { title: "Create Apartment Move" };

export default function NewApartmentMovePage() {
  return <CustomerRequestFlow initialRequestType="ApartmentMove" />;
}
