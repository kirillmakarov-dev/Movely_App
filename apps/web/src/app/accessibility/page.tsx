import type { Metadata } from "next";
import InformationPage from "@/components/InformationPage";
import { accessibilityDocument } from "@/lib/legal-content";

export const metadata: Metadata = { title: "נגישות" };

export default function Page() {
  return <InformationPage document={accessibilityDocument} />;
}
