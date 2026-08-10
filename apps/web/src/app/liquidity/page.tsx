import type { Metadata } from "next";
import { LiquidityPage } from "@/components/financial/liquidity-page";

export const metadata: Metadata = {
  title: "Likviditet",
};

export default function Page() {
  return <LiquidityPage />;
}
