"use client";

import { useLocale, type Locale } from "@/components/LocaleProvider";

const languages: Array<{ value: Locale; short: string; label: string }> = [
  { value: "en", short: "EN", label: "English" },
  { value: "he", short: "עב", label: "עברית" },
];

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="language-switcher" role="group" aria-label={locale === "he" ? "בחירת שפה" : "Choose language"} data-no-translate>
      {languages.map((language) => (
        <button
          key={language.value}
          type="button"
          className="language-option"
          aria-pressed={locale === language.value}
          aria-label={language.label}
          title={language.label}
          onClick={() => setLocale(language.value)}
        >
          <span aria-hidden="true">{language.short}</span>
        </button>
      ))}
    </div>
  );
}
