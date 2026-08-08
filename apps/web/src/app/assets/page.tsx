import type { Metadata } from "next";
import { AssetsPage } from "@/components/money/assets-page";

export const metadata: Metadata = {
  title: "Tillgångar",
};

export default function Page() {
  return <AssetsPage />;
}
