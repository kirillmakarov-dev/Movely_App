import { Noto_Sans_Hebrew } from "next/font/google";
import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import type { Locale } from "@/lib/locale";

const metadataCopy = {
  he: { title: "Movely - הובלות בראש שקט", description: "תארו את ההובלה והתחברו למובילים מתאימים דרך Movely.", image: "Movely, שירות לתכנון הובלה" },
  en: { title: "Movely - Moving made clearer", description: "Describe your move and connect with suitable movers through Movely.", image: "Movely moving service" },
  ru: { title: "Movely - Переезд без лишних хлопот", description: "Опишите переезд и найдите подходящих перевозчиков с Movely.", image: "Movely, сервис для организации переезда" },
};
function requestLocale(value: string | null): Locale { return value === "en" || value === "ru" ? value : "he"; }

const hebrewFont = Noto_Sans_Hebrew({
  subsets: ["hebrew", "latin"],
  display: "swap",
  variable: "--font-hebrew",
});

export async function generateMetadata(): Promise<Metadata> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const baseUrl = host ? `${protocol}://${host}` : "http://localhost:3000";
  const copy = metadataCopy[requestLocale(headerList.get("x-movely-locale"))];

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: copy.title,
      template: "%s | Movely",
    },
    description: copy.description,
    openGraph: {
      title: copy.title,
      description: copy.description,
      images: [
        {
          url: "/og.png",
          width: 1731,
          height: 909,
          alt: copy.image,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: ["/og.png"],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const requestHeaders = await headers();
  const locale = requestLocale(requestHeaders.get("x-movely-locale"));
  const currentPath = requestHeaders.get("x-movely-path") ?? "/";
  return (
    <html lang={locale} dir={locale === "he" ? "rtl" : "ltr"} className={`h-full ${hebrewFont.variable}`}>
      <body className="min-h-full text-slate-950">
        <LanguageSwitcher currentLocale={locale} currentPath={currentPath} />
        {children}
      </body>
    </html>
  );
}
