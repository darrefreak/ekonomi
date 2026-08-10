import { eq } from "drizzle-orm";
import { getDb, getPool } from "./client";
import { describeDatabaseTarget } from "./database-target";
import { featureFlags } from "./schema";
import { seedDemoHousehold } from "./seed/demo-household";

async function seedFeatureFlags() {
  const db = getDb();
  const flags = [
    { key: "AI", enabled: true, description: "AI advisor features (tools-only)" },
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
    } else if (flag.key === "AI") {
      // Workstream L: demo AI path on; endpoints still respect disabled via gate
      await db
        .update(featureFlags)
        .set({ enabled: true, description: flag.description })
        .where(eq(featureFlags.key, "AI"));
    }
  }
}

async function main() {
  // Seeding writes a demo household with a published password. That belongs in
  // a disposable database only, so it obeys the same target policy as the
  // destructive reset (RT2-006).
  const target = describeDatabaseTarget(process.env.DATABASE_URL);
  if (target.kind !== "test" && target.kind !== "development") {
    throw new Error(
      `Refusing to seed demo data into ${target.describe()}: only databases whose name ends in _dev or _test may be seeded.`,
    );
  }
  if ((process.env.NODE_ENV ?? "").trim().toLowerCase() === "production") {
    throw new Error("Refusing to seed demo data with NODE_ENV=production.");
  }
  console.log(`Seeding ${target.describe()}`);

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
