import type { Metadata } from "next";
import { NetWorthPage } from "@/components/money/net-worth-page";

export const metadata: Metadata = {
  title: "Nettoförmögenhet",
};

export default function Page() {
  return <NetWorthPage />;
}
