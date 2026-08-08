import type { MoveBudgetBand, MoveRequestStatus, MoveRequestType } from "@/lib/movely-api";

export const requestTypeLabels: Record<MoveRequestType, string> = {
  ApartmentMove: "Apartment Move",
  SmallMove: "Small Move",
};

export const requestStatusLabels: Record<MoveRequestStatus, string> = {
  Draft: "Draft",
  Published: "Published",
  Active: "Active",
  Closed: "Closed",
  Cancelled: "Cancelled",
  Expired: "Expired",
};

export const budgetLabels: Record<MoveBudgetBand, string> = {
  UpTo1000: "Up to NIS 1,000",
  From1000To1500: "NIS 1,000-1,500",
  From1500To2000: "NIS 1,500-2,000",
  From2000To3000: "NIS 2,000-3,000",
  From3000To5000: "NIS 3,000-5,000",
  From5000Plus: "NIS 5,000+",
  Unknown: "Budget not set",
};

export function formatRequestStatus(status: MoveRequestStatus) {
  return requestStatusLabels[status] ?? "Request";
}

export function formatRequestType(type: MoveRequestType) {
  return requestTypeLabels[type] ?? "Move Request";
}
