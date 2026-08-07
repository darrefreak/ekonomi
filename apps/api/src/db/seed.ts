import { eq } from "drizzle-orm";
import { getDb, getPool } from "./client";
import { featureFlags } from "./schema";

async function main() {
  const db = getDb();
  const flags = [
    { key: "AI", enabled: false, description: "AI advisor features" },
    { key: "browserConnectors", enabled: false, description: "Browser connectors" },
    { key: "payments", enabled: false, description: "Payment initiation" },
    { key: "nativeApp", enabled: false, description: "Native app features" },
    { key: "experimentalForecast", enabled: false, description: "Experimental forecast" },
    {
      key: "vehicleMarketIntelligence",
      enabled: false,
      description: "Vehicle market intelligence",
    },
    {
      key: "vehicleRecommendations",
      enabled: true,
      description: "Vehicle recommendation UI stubs",
    },
    { key: "housingIntelligence", enabled: false, description: "Housing intelligence" },
  ];

  for (const flag of flags) {
    const existing = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, flag.key))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(featureFlags).values(flag);
    }
  }

  console.log("Seed complete (feature flags). Full demo household seed is Phase 2.");
  await getPool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
