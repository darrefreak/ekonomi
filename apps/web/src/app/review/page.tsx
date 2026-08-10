import type { Metadata } from "next";
import { ReviewPage } from "@/components/money/review-page";

export const metadata: Metadata = {
  title: "Granska",
};

export default function Page() {
  return <ReviewPage />;
}
