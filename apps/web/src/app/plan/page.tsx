import type { Metadata } from "next";
import { HubPage } from "@/components/layout/hub-page";
import { planHub } from "@/components/layout/nav-config";

export const metadata: Metadata = {
  title: "Planera",
};

const descriptions: Record<string, string> = {
  "/budget": "Föreslagen budget ur din egen historik",
  "/calendar": "Kommande betalningar och beräknat saldo dag för dag",
  "/forecast": "Kassaflödesprognos framåt",
  "/goals": "Sparmål och öronmärkta pengar",
  "/scenarios": "Vad händer om?",
};

export default function Page() {
  return (
    <HubPage
      title="Planera"
      description="Vad som händer härnäst, och vad du vill ska hända."
      items={planHub}
      descriptions={descriptions}
    />
  );
}
