import type { Metadata } from "next";
import OwnedRequestDetails from "@/features/account/OwnedRequestDetails";

export const metadata: Metadata = {
  title: "פרטי הבקשה שלי",
  robots: { index: false, follow: false },
};

export default async function OwnedRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OwnedRequestDetails requestId={id} />;
}
