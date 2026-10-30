import { headers } from "next/headers";

const copy = {
  he: { title: "העמוד לא נמצא", message: "ייתכן שהכתובת השתנתה. אפשר לחזור לדף הבית ולהמשיך משם.", back: "חזרה לדף הבית" },
  en: { title: "Page not found", message: "The address may have changed. Return to the home page to continue.", back: "Back to home" },
  ru: { title: "Страница не найдена", message: "Возможно, адрес изменился. Вернитесь на главную страницу и продолжите оттуда.", back: "На главную" },
};
export default async function NotFound() {
  const value = (await headers()).get("x-movely-locale");
  const locale = value === "en" || value === "ru" ? value : "he";
  const text = copy[locale];
  return <main id="main-content" className="site-container py-12"><p className="eyebrow">404</p><h1 className="text-3xl font-bold">{text.title}</h1><p className="my-6 text-lg">{text.message}</p><a href={locale === "he" ? "/" : `/${locale}`} className="button button-primary">{text.back}</a></main>;
}
