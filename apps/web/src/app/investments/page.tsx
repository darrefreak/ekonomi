import type { Metadata } from "next";
import { InvestmentsPage } from "@/components/money/investments-page";

export const metadata: Metadata = {
  title: "Investeringar",
};

export default function Page() {
  return <InvestmentsPage />;
}
