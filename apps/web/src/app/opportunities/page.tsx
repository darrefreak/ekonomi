import type { Metadata } from "next";
import { OpportunitiesPage } from "@/components/decisions/opportunities-page";

export const metadata: Metadata = {
  title: "Möjligheter",
};
export default function Page() {
  return <OpportunitiesPage />;
}
