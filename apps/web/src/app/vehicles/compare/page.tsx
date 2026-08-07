import { VehicleMarketPage } from "@/components/vehicles/vehicle-market-page";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ vehicleId?: string }>;
}) {
  const sp = await searchParams;
  return (
    <VehicleMarketPage
      title="Jämför"
      focus="compare"
      vehicleId={sp.vehicleId}
    />
  );
}
