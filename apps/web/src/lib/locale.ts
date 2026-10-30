export type Locale = "he" | "en" | "ru";
// The localization compiler replaces this constant in each locale's modules.
// Locale is request-independent: concurrent visitors never share mutable state.
export const UI_LOCALE: Locale = "he";
export function localeHref(href: string): string {
  if (UI_LOCALE === "he" || !href.startsWith("/") || href.startsWith("//") || /^\/(en|ru)(\/|\?|#|$)/.test(href) || href.startsWith("/api/")) return href;
  return `/${UI_LOCALE}${href === "/" ? "" : href}`;
}
