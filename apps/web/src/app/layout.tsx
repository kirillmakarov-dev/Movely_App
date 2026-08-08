import { Atkinson_Hyperlegible } from "next/font/google";
import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const baseUrl = host ? `${protocol}://${host}` : "http://localhost:3000";

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: "Movely",
      template: "%s | Movely",
    },
    description: "Create a moving request and connect with suitable movers through Movely.",
    openGraph: {
      title: "Movely",
      description: "Create a moving request and connect with suitable movers through Movely.",
      images: [
        {
          url: "/og.png",
          width: 1731,
          height: 909,
          alt: "Movely moving marketplace",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Movely",
      description: "Create a moving request and connect with suitable movers through Movely.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" className={`h-full ${atkinson.className}`}>
      <body className="min-h-full text-slate-950">{children}</body>
    </html>
  );
}
