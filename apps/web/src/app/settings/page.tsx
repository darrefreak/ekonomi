import type { Metadata } from "next";
import { SettingsPage } from "@/components/settings/settings-page";

export const metadata: Metadata = {
  title: "Inställningar",
};

export default function Page() {
  return <SettingsPage />;
}
