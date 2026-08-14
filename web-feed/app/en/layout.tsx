import type { Metadata } from "next";
import { LocaleProvider } from "@/components/locale-provider";

export const metadata: Metadata = {
  title: "Chamber Protocol - Own Your Social Echoes",
  description: "Encrypt and back up your own Facebook posts, then control private reading access through Echo.",
  alternates: {
    canonical: "/echo/en",
    languages: { "zh-TW": "/echo", en: "/echo/en" },
  },
  openGraph: {
    title: "Chamber Protocol - Own Your Social Echoes",
    description: "Locally encrypted Facebook post backups with owner-controlled reading access in Echo.",
    url: "/echo/en",
    siteName: "Chamber Protocol",
    locale: "en_US",
    type: "website",
  },
};

export default function EnglishLayout({ children }: { children: React.ReactNode }) {
  return <LocaleProvider initialLocale="en" autoDetect={false}>{children}</LocaleProvider>;
}
