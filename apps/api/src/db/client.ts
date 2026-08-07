import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as core from "./schema";
import * as economic from "./schema-economic";
import * as planning from "./schema-planning";
import * as vehicles from "./schema-vehicles";
import * as decisions from "./schema-decisions";
import * as vehicleIntel from "./schema-vehicle-intel";
import * as intake from "./schema-intake";
import * as ai from "./schema-ai";
import * as metrics from "./schema-metrics";

const schema = {
  ...core,
  ...economic,
  ...planning,
  ...vehicles,
  ...decisions,
  ...vehicleIntel,
  ...intake,
  ...ai,
  ...metrics,
};

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is required");
    }
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
