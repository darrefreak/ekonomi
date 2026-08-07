import { TransactionDetailPage } from "@/components/money/transaction-detail-page";

export default async function TransactionDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TransactionDetailPage transactionId={id} />;
}
