import type { Metadata } from "next";
import { WhatChangedPage } from "@/components/insights/what-changed-page";

export const metadata: Metadata = {
  title: "Vad har förändrats?",
};

export default function Page() {
  return <WhatChangedPage />;
}
