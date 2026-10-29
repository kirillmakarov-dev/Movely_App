import type { Metadata } from "next";
import NewSupportRequest from "@/features/support/NewSupportRequest";
export const metadata: Metadata = { title: "פנייה חדשה", robots: { index: false, follow: false } };
export default function NewSupportPage() { return <NewSupportRequest />; }
