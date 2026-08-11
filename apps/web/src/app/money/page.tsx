import type { Metadata } from "next";
import { HubPage } from "@/components/layout/hub-page";
import { moneyHub } from "@/components/layout/nav-config";

export const metadata: Metadata = {
  title: "Pengar",
};

const descriptions: Record<string, string> = {
  "/transactions": "Alla transaktioner, sök och filtrera",
  "/accounts": "Saldon och kontohistorik",
  "/subscriptions": "Fasta kostnader, prisändringar och nya åtaganden",
  "/cashflow": "In och ut per månad",
  "/contracts": "Avtal och bindningstider",
};

export default function Page() {
  return (
    <HubPage
      title="Pengar"
      description="Vad som har hänt med pengarna."
      items={moneyHub}
      descriptions={descriptions}
    />
  );
}
