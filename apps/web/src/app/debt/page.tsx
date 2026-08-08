import type { Metadata } from "next";
import { DebtPage } from "@/components/money/debt-page";

export const metadata: Metadata = {
  title: "Skulder",
};

export default function Page() {
  return <DebtPage />;
}
