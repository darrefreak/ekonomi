import type { Metadata } from "next";
import { ForecastPage } from "@/components/decisions/forecast-page";

export const metadata: Metadata = {
  title: "Prognos",
};
export default function Page() {
  return <ForecastPage />;
}
