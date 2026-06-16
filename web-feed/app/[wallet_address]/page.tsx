import { redirect } from "next/navigation";

export default async function CreatorIndex({ params }: { params: Promise<{ wallet_address: string }> }) {
  const resolvedParams = await params;
  // Redirect to the default "all" platform stream route
  redirect(`/${resolvedParams.wallet_address}/all`);
}
