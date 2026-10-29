import type { Metadata } from "next";
import InformationPage from "@/components/InformationPage";
import { privacyDocument } from "@/lib/legal-content";

export const metadata: Metadata = { title: "מדיניות פרטיות", robots: { index: false, follow: true } };

export default function Page() {
  return <InformationPage document={privacyDocument} />;
}
