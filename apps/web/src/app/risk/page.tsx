import type { Metadata } from "next";
import { RiskPage } from "@/components/decisions/risk-page";

export const metadata: Metadata = {
  title: "Risk",
};
export default function Page() {
  return <RiskPage />;
}
