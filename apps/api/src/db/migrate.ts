import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { getPool } from "./client";

async function main() {
  const pool = getPool();
  const db = drizzle(pool);
  const migrationsFolder = path.join(__dirname, "../../drizzle");
  console.log(`Running migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log("Migrations complete");
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
