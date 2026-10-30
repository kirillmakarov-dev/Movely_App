"use client";

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";

const languages: { locale: Locale; label: string }[] = [
  { locale: "he", label: "עברית" },
  { locale: "en", label: "English" },
  { locale: "ru", label: "Русский" },
];
const LanguageContext = createContext({ currentLocale: "he" as Locale, currentPath: "/" });
export function LanguageProvider({ currentLocale, currentPath, children }: { currentLocale: Locale; currentPath: string; children: ReactNode }) {
  return <LanguageContext.Provider value={{ currentLocale, currentPath }}>{children}</LanguageContext.Provider>;
}
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
export default function LanguageSwitcher(props: { currentLocale?: Locale; currentPath?: string } = {}) {
  const context = useContext(LanguageContext);
  const currentLocale = props.currentLocale ?? context.currentLocale;
  const currentPath = props.currentPath ?? context.currentPath;
  const path = useSyncExternalStore(subscribe, () => window.location.pathname + window.location.search + window.location.hash, () => currentPath);
  const edited = useRef(false);
  const dropdown = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onInput = (event: Event) => { if (event.target instanceof HTMLElement && event.target.matches("input, textarea, select, [contenteditable=true]")) edited.current = true; };
    const onChoice = (event: MouseEvent) => { if (event.target instanceof Element && event.target.closest("[data-language-guard] button")) edited.current = true; };
    const onOutside = (event: PointerEvent) => { if (event.target instanceof Node && dropdown.current && !dropdown.current.contains(event.target)) dropdown.current.open = false; };
    document.addEventListener("input", onInput);
    document.addEventListener("change", onInput);
    document.addEventListener("click", onChoice);
    document.addEventListener("pointerdown", onOutside);
    return () => { document.removeEventListener("input", onInput); document.removeEventListener("change", onInput); document.removeEventListener("click", onChoice); document.removeEventListener("pointerdown", onOutside); };
  }, []);
  const label = { he: "בחירת שפה", en: "Choose language", ru: "Выбор языка" }[currentLocale];
  const warning = {
    he: "החלפת שפה טוענת את העמוד מחדש. שמרו טקסט ופרטים שטרם נשלחו לפני המעבר. להחליף שפה עכשיו?",
    en: "Changing language reloads the page. Save any text or details you have not submitted before switching. Change language now?",
    ru: "При смене языка страница перезагрузится. Сохраните текст и данные, которые вы ещё не отправили. Сменить язык сейчас?",
  }[currentLocale];
  return <details ref={dropdown} className="language-dropdown" onKeyDown={event => {
    if (event.key === "Escape" && dropdown.current?.open) {
      event.stopPropagation();
      dropdown.current.open = false;
      dropdown.current.querySelector("summary")?.focus();
    }
  }}>
    <summary className="language-trigger" aria-label={`${label}: ${languages.find(language => language.locale === currentLocale)?.label}`}>
      <span lang={currentLocale} dir="auto">{languages.find(language => language.locale === currentLocale)?.label}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </summary>
    <nav className="language-options" aria-label={label}>
      {languages.map(({ locale, label }) => <a key={locale} href={languageHref(path, locale)} lang={locale} dir="auto" hrefLang={locale} aria-current={locale === currentLocale ? "true" : undefined} onClick={event => {
        if (locale === currentLocale || edited.current && !window.confirm(warning)) event.preventDefault();
        if (locale === currentLocale && dropdown.current) { dropdown.current.open = false; dropdown.current.querySelector("summary")?.focus(); }
      }}>{label}</a>)}
    </nav>
  </details>;
}
