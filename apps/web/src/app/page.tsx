import type { Metadata } from "next";
import { DashboardPage } from "@/components/dashboard/dashboard-page";

export const metadata: Metadata = {
  // The root layout's title template applies to child segments, not to its own,
  // so the dashboard spells out the full title every other route composes.
  title: { absolute: "Översikt · Family Financial OS" },
};

export default function HomePage() {
  return <DashboardPage />;
}
