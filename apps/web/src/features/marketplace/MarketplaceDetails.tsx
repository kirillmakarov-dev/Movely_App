"use client";
import { useCallback, type ReactNode } from "react";
import Link from "@/components/SafeLink";
import { getMarketplaceRequest, marketplaceQuery, parseMarketplaceFilters, type MarketplaceAccess, type MarketplaceFilters, type MarketplaceItem } from "@/lib/marketplace-api";
import { budgetLabels, formatRequestType } from "@/lib/presentation";
import { APARTMENT_INVENTORY_OPTIONS, DATE_FLEXIBILITY_OPTIONS, PREFERRED_TIME_OPTIONS, SMALL_MOVE_CATEGORIES, SPECIAL_ITEM_OPTIONS } from "@/features/request-flow/request-flow-data";
import MarketplaceAccessGate, { MarketplaceError } from "./MarketplaceAccessGate";
import useMarketplaceResource from "./useMarketplaceResource";
import { marketplaceDate } from "./RequestCard";
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="min-w-0"><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-1 break-words font-medium">{children ?? "לא צוין"}</dd></div>; }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-xl font-bold">{title}</h2><div className="mt-5">{children}</div></section>; }
function Access({ title, access }: { title: string; access: MarketplaceAccess | null }) {
  return <Panel title={title}><dl className="grid grid-cols-2 gap-4"><Field label="קומה">{access?.floor === 0 ? "קומת קרקע" : access?.floor}</Field><Field label="מעלית">{access?.hasElevator == null ? "לא צוין" : access.hasElevator ? "יש מעלית" : "אין מעלית"}</Field><Field label="התאמה לרהיטים">{access?.elevatorFurnitureSuitability === "Yes" ? "מתאימה" : access?.elevatorFurnitureSuitability === "No" ? "אינה מתאימה" : "לא ידוע"}</Field><Field label="מרחק חניה">{access?.parkingDistanceMeters == null ? "לא צוין" : `${access.parkingDistanceMeters} מטרים`}</Field></dl></Panel>;
}
function itemLabel(item: MarketplaceItem) {
  if (item.kind === "ApartmentInventory") return APARTMENT_INVENTORY_OPTIONS.find((option) => option.value === item.apartmentInventoryType)?.label ?? "פריט ביתי";
  if (item.kind === "SpecialItem") return SPECIAL_ITEM_OPTIONS.find((option) => option.value === item.specialItemType)?.label ?? "פריט מיוחד";
  return SMALL_MOVE_CATEGORIES.find((option) => option.value === item.smallMoveCategory)?.label ?? "פריט להובלה";
}
export default function MarketplaceDetails({ requestId, filters = parseMarketplaceFilters({}), fromMover = false }: { requestId: string; filters?: MarketplaceFilters; fromMover?: boolean }) {
  const backHref = `${fromMover ? "/mover/requests" : "/requests"}?${marketplaceQuery(filters)}#marketplace-results`;
  return <div className="min-w-0 space-y-6" dir="rtl"><Link href={backHref} className="button button-secondary">חזרה לבקשות</Link><MarketplaceAccessGate><DetailsContent key={requestId} requestId={requestId} /></MarketplaceAccessGate></div>;
}
function DetailsContent({ requestId }: { requestId: string }) {
  const load = useCallback((signal: AbortSignal) => getMarketplaceRequest(requestId, signal), [requestId]);
  const state = useMarketplaceResource(load, requestId);
  if (state.kind === "loading") return <p role="status" className="rounded-xl border border-slate-200 bg-white p-6">טוענים את פרטי הבקשה…</p>;
  if (state.kind === "error") return <MarketplaceError error={state.error} retry={state.retry} />;
  const request = state.data;
  const services = [[request.services.furnitureDisassembly, "פירוק רהיטים"], [request.services.furnitureAssembly, "הרכבת רהיטים"], [request.services.packingAssistance, "סיוע באריזה"], [request.services.packingMaterials, "חומרי אריזה"]].filter(([enabled]) => enabled);
  return <div className="space-y-6">
    <Panel title={formatRequestType(request.requestType)}><dl className="grid gap-4 sm:grid-cols-2"><Field label="מאיפה">{request.pickupCity?.name ?? "יישוב לא מזוהה"}</Field><Field label="לאן">{request.destinationCity?.name ?? "יישוב לא מזוהה"}</Field><Field label="תאריך ההובלה">{marketplaceDate(request.moveDate)}</Field><Field label="שעה מועדפת">{PREFERRED_TIME_OPTIONS.find((option) => option.value === request.preferredTime)?.label ?? "לא צוינה"}</Field><Field label="גמישות בתאריך">{DATE_FLEXIBILITY_OPTIONS.find((option) => option.value === request.dateFlexibility)?.label ?? "לא צוינה"}</Field><Field label="תקציב להובלה">{request.budgetBand ? budgetLabels[request.budgetBand] : "לא צוין"}</Field>{request.requestType === "ApartmentMove" ? <><Field label="חדרים">{request.numberOfRooms}</Field><Field label="ארגזים">{request.boxCount}</Field></> : null}<Field label="כמות פריטים">{request.itemCount}</Field><Field label="פורסם בתאריך">{marketplaceDate(request.publishedAt)}</Field></dl>{request.leadSalesStatus === "SoldOut" ? <p className="mt-4 font-bold">אין מקומות נוספים לבקשה הזאת.</p> : null}</Panel>
    <div className="grid gap-6 xl:grid-cols-2"><Access title="גישה באיסוף" access={request.pickupAccess} /><Access title="גישה ביעד" access={request.destinationAccess} /></div>
    <Panel title="תכולת ההובלה">{request.items.length ? <ul className="grid gap-4 sm:grid-cols-2">{request.items.map((item, index) => <li key={index} className="rounded-lg border border-slate-200 p-4"><h3 className="text-lg font-bold">{itemLabel(item)}</h3><dl className="mt-3 grid grid-cols-2 gap-3"><Field label="כמות">{item.quantity}</Field>{item.lengthCm != null ? <Field label='אורך (ס״מ)'>{item.lengthCm}</Field> : null}{item.widthCm != null ? <Field label='רוחב (ס״מ)'>{item.widthCm}</Field> : null}{item.heightCm != null ? <Field label='גובה (ס״מ)'>{item.heightCm}</Field> : null}{item.approximateWeightKg != null ? <Field label='משקל משוער (ק״ג)'>{item.approximateWeightKg}</Field> : null}</dl></li>)}</ul> : <p className="text-slate-600">לא צוינו פריטים בתצוגה הזאת.</p>}</Panel>
    <Panel title="שירותים נוספים">{services.length ? <ul className="list-inside list-disc space-y-2">{services.map(([, label]) => <li key={String(label)}>{label}</li>)}</ul> : <p className="text-slate-600">לא נבחרו שירותים נוספים.</p>}</Panel>
    <Panel title="פרטי הקשר אינם זמינים"><p className="leading-7 text-slate-700">פרטי הקשר והכתובות המדויקות אינם מוצגים כאן. רכישת לידים ויצירת קשר דרך האתר אינן זמינות כרגע.</p></Panel>
  </div>;
}
