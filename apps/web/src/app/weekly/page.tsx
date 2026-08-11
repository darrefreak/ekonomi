import type { Metadata } from "next";
import { WeeklyReviewPage } from "@/components/insights/weekly-review-page";

export const metadata: Metadata = {
  title: "Veckan",
};

export default function Page() {
  return <WeeklyReviewPage />;
}
