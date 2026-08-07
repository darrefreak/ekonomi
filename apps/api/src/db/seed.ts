import { eq } from "drizzle-orm";
import { getDb, getPool } from "./client";
import { featureFlags } from "./schema";
import { seedDemoHousehold } from "./seed/demo-household";

async function seedFeatureFlags() {
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
}

async function main() {
  await seedFeatureFlags();
  const demo = await seedDemoHousehold();
  console.log("Seed complete");
  console.log(
    JSON.stringify(
      {
        demoEmail: demo.email,
        demoPassword: demo.password,
        householdId: demo.householdId,
        asOf: demo.asOf,
        seedKey: demo.seedKey,
        eventCount: demo.eventCount,
      },
      null,
      2,
    ),
  );
  await getPool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
