"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/locale";

const languages: { locale: Locale; label: string }[] = [
  { locale: "he", label: "עברית" },
  { locale: "en", label: "English" },
  { locale: "ru", label: "Русский" },
];
function subscribe(update: () => void) {
  window.addEventListener("hashchange", update);
  window.addEventListener("popstate", update);
  return () => { window.removeEventListener("hashchange", update); window.removeEventListener("popstate", update); };
}
export function languageHref(path: string, locale: Locale) {
  const unprefixed = path.replace(/^\/(en|ru)(?=\/|\?|#|$)/, "") || "/";
  const normalized = unprefixed.startsWith("/") ? unprefixed : `/${unprefixed}`;
  return locale === "he" ? normalized : `/${locale}${normalized === "/" ? "" : normalized}`;
}
export default function LanguageSwitcher({ currentLocale, currentPath = "/" }: { currentLocale: Locale; currentPath?: string }) {
  const path = useSyncExternalStore(subscribe, () => window.location.pathname + window.location.search + window.location.hash, () => currentPath);
  const edited = useRef(false);
  useEffect(() => {
    const onInput = (event: Event) => { if (event.target instanceof HTMLElement && event.target.matches("input, textarea, select, [contenteditable=true]")) edited.current = true; };
    const onChoice = (event: MouseEvent) => { if (event.target instanceof Element && event.target.closest("[data-language-guard] button")) edited.current = true; };
    document.addEventListener("input", onInput);
    document.addEventListener("change", onInput);
    document.addEventListener("click", onChoice);
    return () => { document.removeEventListener("input", onInput); document.removeEventListener("change", onInput); document.removeEventListener("click", onChoice); };
  }, []);
  const label = { he: "בחירת שפה", en: "Choose language", ru: "Выбор языка" }[currentLocale];
  const warning = {
    he: "החלפת שפה טוענת את העמוד מחדש. שמרו טקסט ופרטים שטרם נשלחו לפני המעבר. להחליף שפה עכשיו?",
    en: "Changing language reloads the page. Save any text or details you have not submitted before switching. Change language now?",
    ru: "При смене языка страница перезагрузится. Сохраните текст и данные, которые вы ещё не отправили. Сменить язык сейчас?",
  }[currentLocale];
  return <div className="locale-bar"><nav className="site-container language-options" aria-label={label} dir="ltr">
    {languages.map(({ locale, label }) => <a key={locale} href={languageHref(path, locale)} lang={locale} hrefLang={locale} aria-current={locale === currentLocale ? "true" : undefined} onClick={event => { if (locale === currentLocale || edited.current && !window.confirm(warning)) event.preventDefault(); }}>{label}</a>)}
  </nav></div>;
}
