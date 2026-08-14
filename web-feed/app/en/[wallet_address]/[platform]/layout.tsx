import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ wallet_address: string; platform: string }> }): Promise<Metadata> {
  const { wallet_address: identity, platform } = await params;
  const canonical = `/echo/en/${identity}/${platform}`;
  const traditionalChinese = `/echo/${identity}/${platform}`;
  return {
    title: `${identity}'s Echo Timeline | Chamber Protocol`,
    description: `View encrypted social posts backed up by ${identity} through Chamber, with reading access controlled by the author.`,
    alternates: { canonical, languages: { "zh-TW": traditionalChinese, en: canonical } },
    openGraph: {
      title: `${identity}'s Echo Timeline`,
      description: "A social timeline preserved by Chamber Protocol with author-controlled reading access.",
      url: canonical,
      siteName: "Chamber Protocol",
      locale: "en_US",
      type: "profile",
    },
  };
}

export default function EnglishTimelineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
