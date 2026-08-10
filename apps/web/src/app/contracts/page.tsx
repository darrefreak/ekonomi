import type { Metadata } from "next";
import { ContractsPage } from "@/components/money/contracts-page";

export const metadata: Metadata = {
  title: "Avtal",
};

export default function Page() {
  return <ContractsPage />;
}
