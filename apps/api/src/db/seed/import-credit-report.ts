/**
 * Import a household's liabilities and property from a UC credit report
 * ("Min Upplysning") into their accounts.
 *
 * Idempotent: each row is matched on its `external_reference`, so re-running
 * the script never creates a duplicate. Balances are booked exactly as the
 * report states them; interest rates are intentionally left unset (NULL) so the
 * debt payoff view marks them as assumed until the household confirms the real
 * figures — the credit report does not contain rates.
 *
 * Usage:
 *   DATABASE_URL=... HOUSEHOLD_ID=<uuid> tsx src/db/seed/import-credit-report.ts
 */
import { and, eq } from "drizzle-orm";
import { getDb, getPool } from "../client";
import { accountBalanceSnapshots, accounts } from "../schema-economic";
import { openingSnapshotAsOf } from "../../common/snapshot-as-of";

const HOUSEHOLD_ID =
  process.env.HOUSEHOLD_ID ?? "344b7242-e53b-4af5-9916-3a81f9b87687";

type AccountType = "MORTGAGE" | "LOAN" | "CREDIT_CARD" | "ASSET";

interface ImportRow {
  name: string;
  provider: string;
  accountType: AccountType;
  /** Positive minor units (öre). */
  balanceMinor: bigint;
  externalReference: string;
  creditLimitMinor?: bigint;
  note?: string;
}

// Simon Hellergård — UC "Min Upplysning", hämtad 2026-08-23.
// Totalt utnyttjad kredit 2 945 988 kr; fastighet Stataren 5, Nynäshamn.
const ROWS: ImportRow[] = [
  {
    name: "Bolån SBAB",
    provider: "Sveriges Bostadsfinansiering",
    accountType: "MORTGAGE",
    // Summan av sex dellån (kreditnr 27679641, 27679668, 28207018, 29040265,
    // 31670381, 32283691) = 2 550 819 kr.
    balanceMinor: 2_550_819_00n,
    externalReference: "UC-BOLAN-SBAB",
    note: "Sex dellån hos Sveriges Bostadsfinansiering, sammanslagna.",
  },
  {
    name: "Blancolån Marginalen Bank",
    provider: "Marginalen Bank",
    accountType: "LOAN",
    balanceMinor: 178_749_00n,
    externalReference: "UC-8001974438",
  },
  {
    name: "Blancolån Facit Bank",
    provider: "Facit Bank",
    accountType: "LOAN",
    balanceMinor: 144_719_00n,
    externalReference: "UC-390499005",
  },
  {
    name: "Kontokredit Bank Norwegian",
    provider: "Noba Bank / Bank Norwegian",
    accountType: "CREDIT_CARD",
    balanceMinor: 71_701_00n,
    creditLimitMinor: 150_000_00n,
    externalReference: "UC-10836496001",
  },
  {
    name: "Bostad – Stataren 5",
    provider: "Taxeringsvärde (Skatteverket)",
    accountType: "ASSET",
    // Taxeringsvärde 2 735 000 kr — konservativt; marknadsvärdet är oftast högre.
    balanceMinor: 2_735_000_00n,
    externalReference: "UC-FASTIGHET-STATAREN-5",
    note: "Taxeringsvärde 2 735 000 kr. Justera till marknadsvärde vid behov.",
  },
];

async function main() {
  const db = getDb();
  let created = 0;
  let skipped = 0;

  for (const row of ROWS) {
    const [existing] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, HOUSEHOLD_ID),
          eq(accounts.externalReference, row.externalReference),
        ),
      )
      .limit(1);

    if (existing) {
      skipped += 1;
      console.log(`skip  ${row.name} (already imported: ${row.externalReference})`);
      continue;
    }

    const opening = row.balanceMinor;
    const [account] = await db
      .insert(accounts)
      .values({
        householdId: HOUSEHOLD_ID,
        name: row.name,
        accountType: row.accountType,
        currency: "SEK",
        provider: row.provider,
        isShared: true,
        creditLimitMinor: row.creditLimitMinor ?? null,
        externalReference: row.externalReference,
        interestRateBps: null,
        openingBalanceMinor: opening,
        currentBalanceMinor: opening,
        reportedBalanceMinor: opening,
        connectionStatus: "DISCONNECTED",
        isSystem: false,
        lastSyncedAt: null,
      })
      .returning();

    if (opening !== 0n) {
      await db.insert(accountBalanceSnapshots).values({
        householdId: HOUSEHOLD_ID,
        accountId: account.id,
        reportedBalanceMinor: opening,
        availableBalanceMinor: opening,
        ledgerCalculatedBalanceMinor: opening,
        reconciledBalanceMinor: opening,
        asOf: openingSnapshotAsOf(new Date()),
        source: "manual_opening",
        confidence: "1",
        userVerified: true,
        isEstimated: false,
      });
    }

    created += 1;
    console.log(`add   ${row.name} (${row.accountType}) ${opening} öre`);
  }

  console.log(`\nDone. Created ${created}, skipped ${skipped}.`);
  await getPool().end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await getPool().end();
  } catch {
    // ignore teardown errors
  }
  process.exit(1);
});
