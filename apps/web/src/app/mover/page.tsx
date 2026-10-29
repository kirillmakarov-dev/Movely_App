import type { Metadata } from "next";
import BusinessHome from "@/features/businesses/BusinessHome";
export const metadata: Metadata = { title: "האזור העסקי", robots: { index: false, follow: false } };
export default function MoverPage() { return <div className="space-y-6" dir="rtl"><h1 className="text-3xl font-bold">האזור העסקי</h1><BusinessHome /></div>; }
