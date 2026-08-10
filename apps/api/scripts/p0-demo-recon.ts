import { and, eq } from "drizzle-orm";
import { AuditService } from "../src/audit/audit.service";
import { getDb } from "../src/db/client";
import { households } from "../src/db/schema";
import { accounts } from "../src/db/schema-economic";
import { vehicles } from "../src/db/schema-vehicles";
import { LedgerTruthService } from "../src/ledger/ledger-truth.service";

async function main() {
  const db = getDb();
  const [h] = await db
    .select()
    .from(households)
    .where(eq(households.name, "Familjen Demo"))
    .limit(1);
  if (!h) {
    console.log(JSON.stringify({ ok: false, reason: "NO_DEMO" }));
    return;
  }
  const rows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.householdId, h.id), eq(accounts.isSystem, false)));
  const ledger = new LedgerTruthService(new AuditService());
  const bal = await ledger.reconstructHousehold(h.id);
  const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
  const recon = await ledger.reconcileHousehold(h.id, asOf);
  const asset = rows.find((a) => a.accountType === "ASSET");
  const [veh] = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.householdId, h.id))
    .limit(1);

  const byType: Record<string, { ledger: string; cache: string; reported: string | null }[]> =
    {};
  for (const a of rows) {
    const list = (byType[a.accountType] ??= []);
    list.push({
      ledger: String(bal.get(a.id) ?? a.openingBalanceMinor),
      cache: String(a.currentBalanceMinor),
      reported:
        a.reportedBalanceMinor == null ? null : String(a.reportedBalanceMinor),
    });
  }

  console.log(
    JSON.stringify(
      {
        household: h.name,
        asOf,
        mismatches: recon.mismatches,
        updated: recon.updated,
        assetOpening: asset ? String(asset.openingBalanceMinor) : null,
        assetLedger: asset ? String(bal.get(asset.id)) : null,
        assetCache: asset ? String(asset.currentBalanceMinor) : null,
        vehicleMid: veh?.estimatedValueMidMinor
          ? String(veh.estimatedValueMidMinor)
          : null,
        byType,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
