import type { MoveItemDto, MoveLocationDto, MoveRequestVersionResponse, UpdateMoveRequestRequest } from "@/lib/movely-api";
import { budgetLabels, formatRequestType } from "@/lib/presentation";
import { APARTMENT_INVENTORY_OPTIONS, DATE_FLEXIBILITY_OPTIONS, PREFERRED_TIME_OPTIONS, SMALL_MOVE_CATEGORIES, SPECIAL_ITEM_OPTIONS } from "./request-flow-data";

export type RequestChange = { key: string; label: string; before: string; after: string };
const absent = "לא צוין";
const excluded = "לא נכלל בסוג ההובלה הזה";
const text = (value: string | number | null | undefined) => value == null || String(value).trim() === "" ? absent : String(value).trim();
const yesNo = (value: boolean | null | undefined) => value == null ? absent : value ? "כן" : "לא";
const option = (value: string | null | undefined, options: { value: string; label: string }[]) => !value ? absent : options.find((item) => item.value === value)?.label ?? "ערך לא מוכר";
function date(value: string | null | undefined) {
  if (!value) return absent;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("he-IL", { dateStyle: "long", timeZone: "UTC" }).format(parsed) : "תאריך לא תקין";
}
function items(values: MoveItemDto[] | null | undefined) {
  if (!values?.length) return "לא נוספו פריטים";
  return values.map((item) => {
    const category = item.kind === "ApartmentInventory" ? option(item.apartmentInventoryType, APARTMENT_INVENTORY_OPTIONS)
      : item.kind === "SpecialItem" ? option(item.specialItemType, SPECIAL_ITEM_OPTIONS) : option(item.smallMoveCategory, SMALL_MOVE_CATEGORIES);
    return [
      `סוג: ${category}; שם: ${text(item.name)}; כמות: ${text(item.quantity)}`,
      `תיאור: ${text(item.description)}`,
      `אורך: ${text(item.lengthCm)} ס״מ; רוחב: ${text(item.widthCm)} ס״מ; גובה: ${text(item.heightCm)} ס״מ; משקל: ${text(item.approximateWeightKg)} ק״ג`,
    ].join("\n");
  }).sort().join("\n\n");
}

// Compare the submitted content, not UI state, IDs or version timestamps.
// Inventory order has no stored meaning; every item's category, text and measurements do.
export function getRequestChanges(before: MoveRequestVersionResponse, after: UpdateMoveRequestRequest): RequestChange[] {
  const changes: RequestChange[] = [];
  function add(key: string, label: string, previous: string, next: string) {
    if (previous !== next) changes.push({ key, label, before: previous, after: next });
  }
  add("requestType", "סוג ההובלה", formatRequestType(before.requestType), formatRequestType(after.requestType));
  function location(prefix: string, title: string, previous: MoveLocationDto | null, next: MoveLocationDto | null) {
    add(`${prefix}.city`, `${title} - יישוב`, text(previous?.city), text(next?.city));
    add(`${prefix}.exactAddress`, `${title} - כתובת`, text(previous?.exactAddress), text(next?.exactAddress));
    add(`${prefix}.floor`, `${title} - קומה`, text(previous?.floor), text(next?.floor));
    add(`${prefix}.hasElevator`, `${title} - מעלית`, yesNo(previous?.hasElevator), yesNo(next?.hasElevator));
    const suitability = (value: MoveLocationDto["elevatorFurnitureSuitability"] | undefined) => value === "Yes" ? "מתאימה" : value === "No" ? "אינה מתאימה" : "לא ידוע";
    add(`${prefix}.elevatorFurnitureSuitability`, `${title} - התאמת המעלית לרהיטים`, suitability(previous?.elevatorFurnitureSuitability), suitability(next?.elevatorFurnitureSuitability));
    add(`${prefix}.stairsInfo`, `${title} - מדרגות`, text(previous?.stairsInfo), text(next?.stairsInfo));
    add(`${prefix}.truckAccessInfo`, `${title} - גישה למשאית`, text(previous?.truckAccessInfo), text(next?.truckAccessInfo));
    add(`${prefix}.parkingDistanceMeters`, `${title} - מרחק מהחניה במטרים`, text(previous?.parkingDistanceMeters), text(next?.parkingDistanceMeters));
  }
  location("pickup", "איסוף", before.pickup, after.pickup);
  location("destination", "יעד", before.destination, after.destination);
  const oldApartment = before.requestType === "ApartmentMove" ? before.apartmentMove : null;
  const newApartment = after.requestType === "ApartmentMove" ? after.apartmentMove : null;
  add("apartmentRooms", "מספר חדרים", oldApartment ? text(oldApartment.numberOfRooms) : excluded, newApartment ? text(newApartment.numberOfRooms) : excluded);
  for (const [key, label] of [["small", "ארגזים קטנים"], ["medium", "ארגזים בינוניים"], ["large", "ארגזים גדולים"]] as const) {
    add(`boxes.${key}`, label, oldApartment ? text(oldApartment.boxes[key]) : excluded, newApartment ? text(newApartment.boxes[key]) : excluded);
  }
  add("apartmentInventory", "תכולת הדירה", oldApartment ? items(oldApartment.inventoryItems) : excluded, newApartment ? items(newApartment.inventoryItems) : excluded);
  for (const [key, label] of [["furnitureDisassembly", "פירוק רהיטים"], ["furnitureAssembly", "הרכבת רהיטים"], ["packingAssistance", "סיוע באריזה"], ["packingMaterials", "חומרי אריזה"]] as const) {
    add(`services.${key}`, label, oldApartment ? yesNo(oldApartment.additionalServices[key]) : excluded, newApartment ? yesNo(newApartment.additionalServices[key]) : excluded);
  }
  add("smallMoveItems", "פריטים להובלה קטנה", before.requestType === "SmallMove" ? items(before.smallMoveItems) : excluded, after.requestType === "SmallMove" ? items(after.smallMoveItems) : excluded);
  add("specialItems", "פריטים מיוחדים", items(before.specialItems), items(after.specialItems));
  add("moveDate", "תאריך ההובלה", date(before.schedule?.moveDate), date(after.schedule?.moveDate));
  add("preferredTime", "שעה מועדפת", option(before.schedule?.preferredTime, PREFERRED_TIME_OPTIONS), option(after.schedule?.preferredTime, PREFERRED_TIME_OPTIONS));
  add("dateFlexibility", "גמישות בתאריך", option(before.schedule?.dateFlexibility, DATE_FLEXIBILITY_OPTIONS), option(after.schedule?.dateFlexibility, DATE_FLEXIBILITY_OPTIONS));
  const budget = (value: MoveRequestVersionResponse["budgetBand"]) => value ? budgetLabels[value] ?? "ערך לא מוכר" : absent;
  add("budgetBand", "תקציב ההובלה", budget(before.budgetBand), budget(after.budgetBand));
  add("customerComment", "הערות", text(before.customerComment), text(after.customerComment));
  const photoKey = (values: MoveRequestVersionResponse["photos"] | null) => JSON.stringify((values ?? []).map((photo) => [photo.objectKey, photo.originalFileName, photo.contentType, photo.sizeBytes, photo.displayOrder]).sort());
  if (photoKey(before.photos) !== photoKey(after.photos)) {
    const describe = (values: MoveRequestVersionResponse["photos"] | null) => `${values?.length ?? 0} תמונות שמורות${values?.length ? `\n${values.map((photo) => photo.originalFileName || "תמונה ללא שם").join("\n")}` : ""}`;
    changes.push({ key: "photos", label: "רשימת התמונות ופרטיהן", before: describe(before.photos), after: describe(after.photos) });
  }
  return changes;
}

export default function RequestChangeSummary({ before, after }: { before: MoveRequestVersionResponse; after: UpdateMoveRequestRequest }) {
  const changes = getRequestChanges(before, after);
  return <section className="min-w-0 space-y-4 rounded-xl border border-slate-300 bg-white p-4 sm:p-5" aria-label="השוואת השינויים בבקשה">
    <h3 className="text-xl font-bold">מה ישתנה בבקשה?</h3>
    <p className="text-base leading-7">{changes.length ? "בדקו את הערכים הקודמים ואת מה שיישמר. הפרטים שלא מופיעים כאן נשארים כפי שהיו." : "לא נמצאו שינויים בפרטי הבקשה. אפשר לחזור לבקשה בלי ליצור גרסה נוספת."}</p>
    {changes.length ? <ul className="space-y-4">{changes.map((change) => <li key={change.key} className="min-w-0 rounded-lg border border-slate-200 p-4">
      <h4 className="text-base font-bold">{change.label}</h4>
      <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-lg bg-slate-50 p-3"><dt className="font-bold">לפני השינוי</dt><dd className="mt-2 whitespace-pre-wrap break-words text-base leading-7">{change.before}</dd></div>
        <div className="min-w-0 rounded-lg bg-teal-50 p-3"><dt className="font-bold">לאחר השמירה</dt><dd className="mt-2 whitespace-pre-wrap break-words text-base leading-7">{change.after}</dd></div>
      </dl>
    </li>)}</ul> : null}
  </section>;
}
