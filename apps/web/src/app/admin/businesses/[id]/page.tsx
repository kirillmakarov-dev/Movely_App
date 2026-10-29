import type { Metadata } from "next";
import Link from "@/components/SafeLink";
import AdminBusinessDetails from "@/features/businesses/AdminBusinessDetails";
export const metadata: Metadata = { title: "בדיקת פרופיל עסקי" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <div className="space-y-6"><Link href="/admin/businesses" className="button button-secondary">חזרה לרשימת העסקים</Link><h1 className="text-3xl font-bold">בדיקת פרופיל עסקי</h1><AdminBusinessDetails businessId={id} /></div>; }
