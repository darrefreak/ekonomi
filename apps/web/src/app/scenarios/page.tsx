import type { Metadata } from "next";
import { ScenariosPage } from "@/components/decisions/scenarios-page";

export const metadata: Metadata = {
  title: "Scenarier",
};
export default function Page() {
  return <ScenariosPage />;
}
