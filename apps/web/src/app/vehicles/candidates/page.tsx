import type { Metadata } from "next";
import { VehicleMarketPage } from "@/components/vehicles/vehicle-market-page";

export const metadata: Metadata = {
  title: "Kandidater",
};

export default function Page() {
  return <VehicleMarketPage title="Kandidater" focus="candidates" />;
}
