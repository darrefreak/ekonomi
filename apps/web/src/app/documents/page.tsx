import type { Metadata } from "next";
import { DocumentsPage } from "@/components/intake/documents-page";

export const metadata: Metadata = {
  title: "Dokument",
};
export default function Page() {
  return <DocumentsPage />;
}
