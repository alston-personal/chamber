import { redirect } from "next/navigation";

export default async function EnglishCreatorIndex({ params }: { params: Promise<{ wallet_address: string }> }) {
  const { wallet_address: walletAddress } = await params;
  redirect(`/en/${walletAddress}/all`);
}
