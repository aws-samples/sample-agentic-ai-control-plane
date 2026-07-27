import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import {
  Geist,
  Geist_Mono,
  Inter,
  Noto_Sans_JP,
  Noto_Sans_KR,
} from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";
import { headers } from "next/headers";


const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-sans",
});
const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  variable: "--font-sans",
});

const localeFontVariable: Record<string, string> = {
  ja: notoSansJP.variable,
  ko: notoSansKR.variable,
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agent Management Platform",
  description: "AI agent management and governance platform",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={cn(localeFontVariable[locale] ?? inter.variable)}
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NuqsAdapter>
          <NextIntlClientProvider messages={messages}>
            {children}
            <Toaster position="bottom-right" />
          </NextIntlClientProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
