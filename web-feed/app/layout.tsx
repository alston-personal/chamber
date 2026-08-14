import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/components/locale-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chamber Protocol - 去中心化社交迴響室",
  description: "Chamber: 寄生於 Web2 臉書、備份主權與社交關係網至 Web3 的去中心化社交底層工具",
  metadataBase: new URL("https://studio.milkcat.org"),
  alternates: {
    canonical: "/echo",
    languages: { "zh-TW": "/echo", en: "/echo/en" },
  },
  openGraph: {
    title: "Chamber Protocol - 去中心化社交迴響室",
    description: "加密備份自己的 Facebook 文章，並在 Echo 掌握閱讀權限。",
    url: "/echo",
    siteName: "Chamber Protocol",
    locale: "zh_TW",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-TW"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 font-sans">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
