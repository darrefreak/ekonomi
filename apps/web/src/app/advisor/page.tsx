import type { Metadata } from "next";
import { AdvisorPage } from "@/components/ai/advisor-page";

export const metadata: Metadata = {
  title: "Rådgivare",
};
export default function Page() {
  return <AdvisorPage />;
}
