import type { Metadata } from "next";
import InformationPage from "@/components/InformationPage";
import { helpDocument } from "@/lib/legal-content";

export const metadata: Metadata = { title: "עזרה" };

export default function Page() {
  return <InformationPage document={helpDocument} />;
}
