import type { Metadata } from "next";
import BusinessProfile from "@/features/businesses/BusinessProfile";
export const metadata: Metadata = { title: "פרופיל עסקי", robots: { index: false, follow: false } };
export default function MoverProfilePage() { return <div className="space-y-6" dir="rtl"><header><h1 className="text-3xl font-bold">פרופיל עסקי</h1><p className="mt-3 leading-7 text-slate-600">הפרטים שהצוות צריך כדי לבדוק את העסק ואת הנציג המורשה.</p></header><BusinessProfile /></div>; }
