import type { Metadata } from "next";
import { AccountsPage } from "@/components/money/accounts-page";

export const metadata: Metadata = {
  title: "Konton",
};

export default function Page() {
  return <AccountsPage />;
}
