import type { Metadata } from "next";
import { CashflowPage } from "@/components/money/cashflow-page";

export const metadata: Metadata = {
  title: "Kassaflöde",
};

export default function Page() {
  return <CashflowPage />;
}
