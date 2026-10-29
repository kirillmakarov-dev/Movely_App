/** Calendar day used by the Israeli service, regardless of the device's timezone. */
export function israelCalendarDate(at = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
