import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import sourceMessages from "@/translations/source-messages.json";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import LanguageSwitcher, { languageHref } from "@/components/LanguageSwitcher";
import { messageCatalog, translateSource } from "../../scripts/generate-locales.mjs";
import EnglishHome from "@/localized/en/app/page";
import RussianHome from "@/localized/ru/app/page";
import EnglishInfo from "@/localized/en/components/InformationPage";
import RussianInfo from "@/localized/ru/components/InformationPage";
import { privacyDocument as enPrivacy, termsDocument as enTerms } from "@/localized/en/lib/legal-content";
import { privacyDocument as ruPrivacy, termsDocument as ruTerms } from "@/localized/ru/lib/legal-content";
import { localeHref as englishHref } from "@/localized/en/lib/locale";
import { localeHref as russianHref } from "@/localized/ru/lib/locale";
import { validateRequest as validateEnglish } from "@/localized/en/features/request-flow/request-validation";
import { validateRequest as validateRussian } from "@/localized/ru/features/request-flow/request-validation";
import { makeFormState, buildUpdatePayload } from "@/localized/ru/features/request-flow/request-form-model";
import * as russianApi from "@/localized/ru/lib/movely-api";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

test.each([
  ["/account/support?page=2#reply", "ru", "/ru/account/support?page=2#reply"],
  ["/ru/account/requests/abc?view=full#details", "en", "/en/account/requests/abc?view=full#details"],
  ["/en/request/new", "he", "/request/new"],
  ["/ru", "he", "/"],
] as const)("language switch keeps the destination %s", (url, locale, expected) => expect(languageHref(url, locale)).toBe(expected));

test("language switch warns before discarding edited text and can be cancelled", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<><LanguageSwitcher currentLocale="ru" /><textarea aria-label="draft" defaultValue="" /></>);
  fireEvent.input(screen.getByLabelText("draft"), { target: { value: "Личные заметки" } });
  expect(fireEvent.click(screen.getByRole("link", { name: "English" }))).toBe(false);
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Сохраните текст"));
  expect(screen.getByLabelText("draft")).toHaveValue("Личные заметки");
});

test("server-rendered language links keep the current page before hydration", () => {
  const html=renderToStaticMarkup(<LanguageSwitcher currentLocale="en" currentPath="/en/privacy?from=consent" />);
  expect(html).toContain('href="/ru/privacy?from=consent"');
  expect(html).toContain('href="/privacy?from=consent"');
});

test.each([englishHref,russianHref])("locale navigation preserves external destinations and API paths", (href) => {
  expect(href("https://example.com")).toBe("https://example.com");
  expect(href("//example.com")).toBe("//example.com");
  expect(href("#details")).toBe("#details");
  expect(href("/api/v1/auth/me")).toBe("/api/v1/auth/me");
  expect(href("/en/help")).toBe("/en/help");
});

test.each([["/ru/help?page=2","ru"],["/en","en"],["/auth","he"],["/russian","he"]])("proxy derives language from %s and rejects spoofed headers", (path, locale) => {
  const response=proxy(new NextRequest(`https://movely.test${path}`,{headers:{"x-movely-locale":"xx","x-movely-path":"/fake"}}));
  expect(response.headers.get("x-middleware-request-x-movely-locale")).toBe(locale);
  expect(response.headers.get("x-middleware-request-x-movely-path")).toBe(path);
});

test("every extracted message has both complete translations without long dashes", () => {
  const catalog=messageCatalog();
  for(const {he} of sourceMessages){ const row=catalog.get(he); expect(row,he).toBeDefined(); for(const locale of ["en","ru"]){expect(row[locale].trim(),he).not.toBe("");expect(row[locale],he).not.toMatch(/[\u2013\u2014\u0590-\u05ff]/);} }
});

test("compilation fails on missing text instead of silently mixing languages", () => {
  expect(()=>translateSource('const label="טקסט חסר לבדיקה";',"missing.ts","ru",new Map())).toThrow("Missing ru translation");
});

test.each([[EnglishHome,"en"],[RussianHome,"ru"]] as const)("public home renders translated links and no Hebrew fallback: %s", (Home, locale) => {
  const html=renderToStaticMarkup(<Home />);
  expect(html).toContain(`href="/${locale}/request/new"`);
  expect(html).not.toMatch(/[\u0590-\u05ff\u2013\u2014]/);
  expect(html).not.toContain("&amp;larr;");
});

test.each([[EnglishInfo,enPrivacy],[EnglishInfo,enTerms],[RussianInfo,ruPrivacy],[RussianInfo,ruTerms]] as const)("current legal drafts retain their version and caveats in translation", (Info, document) => {
  const html=renderToStaticMarkup(<Info document={document} />);
  expect(html).toContain("draft-2026-10-29-v2");
  expect(document.draft).toBe(true);
  expect(html).not.toMatch(/[\u0590-\u05ff\u2013\u2014]/);
});

test.each([validateEnglish,validateRussian])("form validation is translated while preserving field IDs", (validate) => {
  const issues=validate(makeFormState(),true,"2026-10-30");
  expect(issues.find(issue=>issue.field==="pickup.city")).toBeDefined();
  for(const issue of issues) expect(issue.message).not.toMatch(/[\u0590-\u05ff\u2013\u2014]/);
});

test("Russian forms preserve Hebrew or English user content in API payloads", () => {
  const form=makeFormState(); form.pickup.city="חיפה"; form.pickup.exactAddress="רחוב לדוגמה 3"; form.customerComment="Do not translate my notes — תודה";
  const payload=buildUpdatePayload(form);
  expect(JSON.stringify(payload)).toContain("רחוב לדוגמה 3");
  expect(JSON.stringify(payload)).toContain("Do not translate my notes — תודה");
});

test("unrecognized backend errors use Russian copy instead of leaking server text", async () => {
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({errorCode:"UNKNOWN",message:"Private database failure"}),{status:500,headers:{"Content-Type":"application/json"}})));
  await expect(russianApi.getMyMoveRequests()).rejects.toMatchObject({errorCode:"UNKNOWN",message:expect.stringMatching(/[а-я]/i)});
});
