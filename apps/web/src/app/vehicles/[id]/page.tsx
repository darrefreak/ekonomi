import type { Metadata } from "next";
import { VehicleDetailPage } from "@/components/vehicles/vehicle-detail-page";

export const metadata: Metadata = {
  title: "Fordon",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VehicleDetailPage vehicleId={id} />;
}
