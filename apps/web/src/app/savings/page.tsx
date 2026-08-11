import type { Metadata } from "next";
import { SavingsPage } from "@/components/insights/savings-page";

export const metadata: Metadata = {
  title: "Sparande",
};

export default function Page() {
  return <SavingsPage />;
}
