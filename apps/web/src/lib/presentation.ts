import type { MoveBudgetBand, MoveRequestStatus, MoveRequestType } from "@/lib/movely-api";

export const requestTypeLabels: Record<MoveRequestType, string> = {
  ApartmentMove: "הובלת דירה",
  SmallMove: "הובלה קטנה",
};

export const requestStatusLabels: Record<MoveRequestStatus, string> = {
  Draft: "טיוטה",
  Published: "פורסמה",
  Active: "פעילה",
  Closed: "סגורה",
  Cancelled: "בוטלה",
  Expired: "פגה",
};

export const budgetLabels: Record<MoveBudgetBand, string> = {
  UpTo1000: "עד 1,000 ₪",
  From1000To1500: "1,000-1,500 ₪",
  From1500To2000: "1,500-2,000 ₪",
  From2000To3000: "2,000-3,000 ₪",
  From3000To5000: "3,000-5,000 ₪",
  From5000Plus: "5,000 ₪ ומעלה",
  Unknown: "התקציב לא הוגדר",
};

export function formatRequestStatus(status: MoveRequestStatus) {
  return requestStatusLabels[status] ?? "בקשה";
}

export function formatRequestType(type: MoveRequestType) {
  return requestTypeLabels[type] ?? "בקשת הובלה";
}
