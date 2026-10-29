import Link from "@/components/SafeLink";
import type { MarketplaceCard } from "@/lib/marketplace-api";
import { budgetLabels, formatRequestType } from "@/lib/presentation";
export function marketplaceDate(value: string | null) { return value ? new Intl.DateTimeFormat("he-IL", { dateStyle: "long", timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? "UTC" : "Asia/Jerusalem" }).format(new Date(value)) : "לא צוין"; }
export default function RequestCard({ request, returnQuery = "", fromMover = false }: { request: MarketplaceCard; returnQuery?: string; fromMover?: boolean }) {
  const query = new URLSearchParams(returnQuery);
  if (fromMover) query.set("from", "mover");
  return <article className="request-card gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><span className={`category-label ${request.requestType === "ApartmentMove" ? "category-apartment" : "category-small"}`}>{formatRequestType(request.requestType)}</span>{request.leadSalesStatus === "SoldOut" ? <span className="text-sm font-bold text-slate-600">אין מקומות נוספים</span> : null}</div>
    <h2 className="break-words text-xl font-bold"><span className="block">מאיפה: {request.pickupCity?.name ?? "יישוב לא מזוהה"}</span><span className="mt-1 block">לאן: {request.destinationCity?.name ?? "יישוב לא מזוהה"}</span></h2>
    <dl className="grid grid-cols-2 gap-4 text-base"><div className="col-span-2"><dt className="text-sm text-slate-600">תאריך ההובלה</dt><dd className="font-medium">{marketplaceDate(request.moveDate)}</dd></div>{request.requestType === "ApartmentMove" ? <><div><dt className="text-sm text-slate-600">חדרים</dt><dd>{request.numberOfRooms ?? "לא צוין"}</dd></div><div><dt className="text-sm text-slate-600">ארגזים</dt><dd>{request.boxCount}</dd></div></> : <div><dt className="text-sm text-slate-600">כמות פריטים</dt><dd>{request.itemCount}</dd></div>}<div className="col-span-2"><dt className="text-sm text-slate-600">תקציב להובלה</dt><dd>{request.budgetBand ? budgetLabels[request.budgetBand] : "לא צוין"}</dd></div></dl>
    <p className="text-sm text-slate-600">פורסם ב־{marketplaceDate(request.publishedAt)}</p>
    <Link href={`/requests/${encodeURIComponent(request.id)}${query.size ? `?${query}` : ""}`} className="request-card-link">צפייה בבקשה</Link>
  </article>;
}
