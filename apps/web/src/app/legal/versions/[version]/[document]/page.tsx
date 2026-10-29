import type { Metadata } from "next";
import { notFound } from "next/navigation";
import InformationPage from "@/components/InformationPage";
import previous from "@/lib/legal-archive/draft-2026-10-29.json";

export const metadata: Metadata = { title: "גרסה קודמת של מסמך", robots: { index: false, follow: true } };

export default async function ArchivedLegalPage({ params }: { params: Promise<{ version: string; document: string }> }) {
  const { version, document } = await params;
  if (version !== previous.version || (document !== "privacy" && document !== "terms")) notFound();
  return <InformationPage document={previous[document]} currentHref={document === "privacy" ? "/privacy" : "/terms"} />;
}
