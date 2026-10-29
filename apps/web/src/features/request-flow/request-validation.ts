import type { FormState } from "./request-flow-types";
import { israelCalendarDate } from "@/lib/israel-calendar-date";

export type RequestIssue = { field: string; step: string; message: string };
const int32 = (value: number, min: number, max = 2_147_483_647) => Number.isInteger(value) && value >= min && value <= max;

// Keep publication requirements aligned with MoveRequestService.ValidateVersionForPublish.
// Incomplete drafts are allowed; malformed supplied values are not sent to the API.
export function validateRequest(form: FormState, complete: boolean, today = israelCalendarDate()): RequestIssue[] {
  const issues: RequestIssue[] = [];
  const add = (field: string, step: string, message: string) => issues.push({ field, step, message });
  const contents = form.requestType === "SmallMove" ? "items" : "contents";
  if (complete && !form.requestType) add("requestType", "move-type", "בחרו סוג הובלה כדי להמשיך.");
  for (const prefix of ["pickup", "destination"] as const) {
    const location = form[prefix];
    const title = prefix === "pickup" ? "האיסוף" : "היעד";
    if (complete && !location.city?.trim()) add(`${prefix}.city`, "route", `הוסיפו את עיר ${title}.`);
    if (complete && !location.exactAddress?.trim()) add(`${prefix}.exactAddress`, "route", `הוסיפו את כתובת ${title}, כולל רחוב ומספר בית.`);
    if (location.floor !== null && !int32(location.floor, -5, 200)) add(`${prefix}.floor`, "route", `קומת ${title}: הזינו מספר שלם בין ‎-5 ל־200.`);
    if (location.parkingDistanceMeters !== null && !int32(location.parkingDistanceMeters, 0)) add(`${prefix}.parkingDistanceMeters`, "route", `מרחק החניה ב${title}: הזינו מספר שלם שאינו שלילי.`);
  }
  if (form.requestType === "ApartmentMove") {
    if ((complete && form.apartmentRooms === null) || (form.apartmentRooms !== null && !int32(form.apartmentRooms, 1, 20))) add("apartmentRooms", contents, "בחרו את מספר החדרים בדירה.");
    for (const key of ["smallBoxes", "mediumBoxes", "largeBoxes"] as const) {
      if (!int32(form[key], 0)) add(key, contents, "כמות הארגזים צריכה להיות מספר שלם שאינו שלילי.");
    }
  }
  if (complete && form.requestType === "SmallMove" && !form.smallMoveItems.length) add("smallMoveItems", contents, "הוסיפו לפחות פריט אחד להובלה.");
  const collections = form.requestType === "SmallMove" ? ["smallMoveItems", "specialItems"] as const : ["apartmentInventory", "specialItems"] as const;
  for (const collection of collections) {
    form[collection].forEach((item, index) => {
      if (!int32(item.quantity, 1)) add(`${collection}.${item.id}.quantity`, contents, `כמות בפריט ${index + 1}: הזינו מספר שלם גדול מאפס.`);
      if ("lengthCm" in item) {
        for (const [key, label] of [["lengthCm", "אורך"], ["widthCm", "רוחב"], ["heightCm", "גובה"], ["approximateWeightKg", "משקל"]] as const) {
          const value = item[key].trim();
          if (value && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > Number("79228162514264337593543950335"))) add(`${collection}.${item.id}.${key}`, contents, `${label} בפריט ${index + 1}: הזינו מספר שאינו שלילי, או השאירו ריק.`);
        }
      }
    });
  }
  if (complete && !form.moveDate) add("moveDate", "schedule", "בחרו תאריך להובלה.");
  if (form.moveDate && (!/^\d{4}-\d{2}-\d{2}$/.test(form.moveDate) || !Number.isFinite(Date.parse(form.moveDate)) || new Date(form.moveDate).toISOString().slice(0, 10) !== form.moveDate || form.moveDate < today)) add("moveDate", "schedule", "בחרו תאריך תקין, מהיום והלאה.");
  if (complete && !form.preferredTime) add("preferredTime", "schedule", "בחרו שעה מועדפת להובלה.");
  if (complete && !form.dateFlexibility) add("dateFlexibility", "schedule", "בחרו עד כמה תאריך ההובלה גמיש.");
  if (form.customerComment.length > 2000) add("customerComment", "schedule", "קצרו את ההערות ל־2,000 תווים לכל היותר.");
  return issues;
}
