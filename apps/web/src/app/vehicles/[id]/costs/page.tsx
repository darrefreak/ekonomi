import type { Metadata } from "next";
import { VehicleCostsPage } from "@/components/vehicles/vehicle-costs-page";

export const metadata: Metadata = {
  title: "Fordonskostnader",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VehicleCostsPage vehicleId={id} />;
}
