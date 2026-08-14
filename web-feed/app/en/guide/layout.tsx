import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Installation & User Guide | Chamber Protocol",
  description: "Install Chamber Extension, map Facebook, back up encrypted posts, recover keys, and manage private reading access in Echo.",
  alternates: { canonical: "/echo/en/guide", languages: { "zh-TW": "/echo/guide", en: "/echo/en/guide" } },
};

export default function EnglishGuideLayout({ children }: { children: React.ReactNode }) { return children; }
