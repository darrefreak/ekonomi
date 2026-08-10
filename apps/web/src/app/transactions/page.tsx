import type { Metadata } from "next";
import { TransactionsPage } from "@/components/money/transactions-page";

export const metadata: Metadata = {
  title: "Transaktioner",
};

export default function Page() {
  return <TransactionsPage />;
}
