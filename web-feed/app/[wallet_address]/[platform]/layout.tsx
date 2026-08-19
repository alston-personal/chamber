import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ wallet_address: string; platform: string }> }): Promise<Metadata> {
  const { wallet_address: identity, platform } = await params;
  const canonical = `/echo/${identity}/${platform}`;
  const english = `/echo/en/${identity}/${platform}`;
  return {
    title: `${identity} 的迴響谷 | Chamber Protocol`,
    description: `在迴響谷查看 ${identity} 透過 Chamber 備份的加密社交文章。`,
    alternates: { canonical, languages: { "zh-TW": canonical, en: english } },
    openGraph: {
      title: `${identity} 的迴響谷`,
      description: "由 Chamber Protocol 保存、由作者控制閱讀權限的社交文章迴響谷。",
      url: canonical,
      siteName: "Chamber Protocol",
      locale: "zh_TW",
      type: "profile",
    },
  };
}

export default function TimelineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
