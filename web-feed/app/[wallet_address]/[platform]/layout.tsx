import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ wallet_address: string; platform: string }> }): Promise<Metadata> {
  const { wallet_address: identity, platform } = await params;
  const canonical = `/echo/${identity}/${platform}`;
  const english = `/echo/en/${identity}/${platform}`;
  return {
    title: `@${identity} 的迴響谷 | Chamber Protocol`,
    description: `念念不忘，必有迴響。在迴響谷查看 @${identity} 透過 Chamber Protocol 永久存證的去中心化社交記憶與文章。`,
    alternates: { canonical, languages: { "zh-TW": canonical, en: english } },
    openGraph: {
      title: `@${identity} 的迴響谷 | Chamber Protocol`,
      description: "念念不忘，必有迴響。由 Chamber Protocol 保存、由作者控制閱讀權限的去中心化社交迴響谷。",
      url: canonical,
      siteName: "Chamber Protocol",
      images: [
        {
          url: "https://studio.milkcat.org/echo/leopardcat/sitting.jpg",
          width: 1024,
          height: 1024,
          alt: `${identity} 的迴響谷 - Chamber Protocol`,
        },
      ],
      locale: "zh_TW",
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title: `@${identity} 的迴響谷 | Chamber Protocol`,
      description: "念念不忘，必有迴響。由作者控制閱讀權限的去中心化社交文章迴響谷。",
      images: ["https://studio.milkcat.org/echo/leopardcat/sitting.jpg"],
    },
  };
}

export default function TimelineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
