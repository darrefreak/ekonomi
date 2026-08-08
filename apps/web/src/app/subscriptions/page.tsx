import type { Metadata } from "next";
import { SubscriptionsPage } from "@/components/money/subscriptions-page";

export const metadata: Metadata = {
  title: "Abonnemang",
};

export default function Page() {
  return <SubscriptionsPage />;
}
