import type { Metadata } from "next";
import { InsightsPage } from "@/components/decisions/insights-page";

export const metadata: Metadata = {
  title: "Insikter",
};
export default function Page() {
  return <InsightsPage />;
}
