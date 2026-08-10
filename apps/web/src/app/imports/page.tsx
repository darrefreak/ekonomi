import type { Metadata } from "next";
import { ImportsPage } from "@/components/intake/imports-page";

export const metadata: Metadata = {
  title: "Importer",
};
export default function Page() {
  return <ImportsPage />;
}
