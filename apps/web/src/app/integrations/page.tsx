import type { Metadata } from "next";
import { IntegrationsPage } from "@/components/intake/integrations-page";

export const metadata: Metadata = {
  title: "Kopplingar",
};
export default function Page() {
  return <IntegrationsPage />;
}
