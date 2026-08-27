import type { Metadata } from "next";
import { HubPage } from "@/components/layout/hub-page";
import type { NavItem } from "@/components/layout/nav-config";

export const metadata: Metadata = {
  title: "Lägg till",
};

const items: NavItem[] = [
  { href: "/accounts", label: "Konton, lån & tillgångar" },
  { href: "/vehicles", label: "Bilar & fordon" },
  { href: "/imports", label: "Importera transaktioner" },
  { href: "/subscriptions", label: "Återkommande & abonnemang" },
  { href: "/goals", label: "Mål & sparande" },
  { href: "/documents", label: "Dokument" },
];

const descriptions: Record<string, string> = {
  "/accounts":
    "Bankkonton, bolån, privatlån, kreditkort, bostad och andra tillgångar — med saldo och ränta.",
  "/vehicles": "Lägg till en bil med värde, lån och löpande kostnader.",
  "/imports": "Ladda upp kontoutdrag (SEB CSV) så kommer alla inköp in automatiskt.",
  "/subscriptions": "Se och bekräfta återkommande betalningar som hittats.",
  "/goals": "Sparmål och öronmärkta pengar.",
  "/documents": "Avtal, försäkringar och andra underlag.",
};

export default function Page() {
  return (
    <HubPage
      title="Lägg till i din ekonomi"
      description="Få in hela bilden — konton, lån, hus, bilar och alla inköp. Ju mer som ligger inne, desto bättre blir råden i Att göra."
      items={items}
      descriptions={descriptions}
    />
  );
}
