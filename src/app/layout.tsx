import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { dirFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/context";

/**
 * Cairo: drawn for Arabic first, with a Latin companion and the Turkish
 * diacritics we will need later. Its tall x-height is why 14px body text
 * reads comfortably here where a smaller-eyed face would not.
 *
 * Loaded as a variable font so 400/500/600/700 cost one file, and `swap` so
 * text is never invisible while it downloads.
 */
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "دينتك — نظام إدارة الموارد",
  description: "نظام إدارة المخزون والمبيعات والصيانة لشركة دينتك",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f8fb",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <html lang={locale} dir={dirFor(locale)} className={cairo.variable}>
      <body className="font-sans antialiased">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
