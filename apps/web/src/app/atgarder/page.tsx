import type { Metadata } from "next";
import { DecisionsPage } from "@/components/decisions/decisions-page";

export const metadata: Metadata = {
  title: "Att göra",
};

export default function Page() {
  return <DecisionsPage />;
}
