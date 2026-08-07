import { VehicleMarketPage } from "@/components/vehicles/vehicle-market-page";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <VehicleMarketPage title="Värdering" focus="valuation" vehicleId={id} />
  );
}
