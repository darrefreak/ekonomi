import type { Metadata } from "next";
import { SmartBudgetPage } from "@/components/plan/smart-budget-page";

export const metadata: Metadata = {
  title: "Smart budget",
};

export default function Page() {
  return <SmartBudgetPage />;
}
