import type { Metadata } from "next";
import { GoalsPage } from "@/components/money/goals-page";

export const metadata: Metadata = {
  title: "Mål",
};

export default function Page() {
  return <GoalsPage />;
}
