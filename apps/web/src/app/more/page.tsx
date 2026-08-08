import type { Metadata } from "next";
import { MorePage } from "@/components/layout/more-page";

export const metadata: Metadata = {
  title: "Mer",
};

export default function MoreRoute() {
  return <MorePage />;
}
