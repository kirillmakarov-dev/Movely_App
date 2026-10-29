import type { Metadata } from "next";
import InformationPage from "@/components/InformationPage";
import { termsDocument } from "@/lib/legal-content";

export const metadata: Metadata = { title: "תנאי שימוש", robots: { index: false, follow: true } };

export default function Page() {
  return <InformationPage document={termsDocument} />;
}
