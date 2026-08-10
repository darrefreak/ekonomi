import type { Metadata } from "next";
import { AccountDetailPage } from "@/components/money/account-detail-page";

export const metadata: Metadata = {
  title: "Konto",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AccountDetailPage accountId={id} />;
}
