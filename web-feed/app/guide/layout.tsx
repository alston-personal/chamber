import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "安裝與使用指南 | Chamber Protocol",
  description: "Chamber Extension 安裝、Facebook 備份、Echo 解密、閱讀授權與 2-of-3 復原指南。",
  alternates: { canonical: "/echo/guide", languages: { "zh-TW": "/echo/guide", en: "/echo/en/guide" } },
};

export default function GuideLayout({ children }: { children: React.ReactNode }) { return children; }
