import type { Metadata } from "next";
import { BudgetPage } from "@/components/money/budget-page";

export const metadata: Metadata = {
  title: "Budget",
};

export default function Page() {
  return <BudgetPage />;
}
