import type { Metadata } from "next";
import { VehicleMaintenancePage } from "@/components/vehicles/vehicle-maintenance-page";

export const metadata: Metadata = {
  title: "Fordonsunderhåll",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VehicleMaintenancePage vehicleId={id} />;
}
