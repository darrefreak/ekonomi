import assert from "node:assert/strict";
import test from "node:test";
import * as bcrypt from "bcryptjs";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { createHouseholdSchema } from "@ffos/schemas";
import { getDb } from "../db/client";
import { householdMembers, households, users } from "../db/schema";
import { accounts } from "../db/schema-economic";
import { AuditService } from "../audit/audit.service";
import { UnsupportedHouseholdCurrencyException } from "../common/currency-policy";
import { requireTestDatabase } from "../testing/require-test-database";
import { HouseholdsService } from "./households.service";

/**
 * A household's currency, tested at the boundary that creates one.
 *
 * Onboarding offered EUR and NOK while every account was refused in anything
 * but SEK, so a participant could build a household that could never hold an
 * account and could not be repaired (FPR-001). The rule now lives in the
 * schema, the service and the UI; these tests cover the two that a direct API
 * call reaches.
 */

const suffix = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function owner() {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      email: `currency-${suffix()}@ffos.local`,
      passwordHash: await bcrypt.hash("CurrencyTest123!", 4),
      displayName: "Currency",
    })
    .returning();
  return user;
}

test("the create schema does not accept a currency the product cannot total", () => {
  const eur = createHouseholdSchema.safeParse({ name: "Eurohushåll", baseCurrency: "EUR" });
  assert.equal(eur.success, false);

  const nok = createHouseholdSchema.safeParse({ name: "Norskt", baseCurrency: "NOK" });
  assert.equal(nok.success, false);

  const sek = createHouseholdSchema.safeParse({ name: "Hushåll", baseCurrency: "SEK" });
  assert.equal(sek.success, true);

  const implied = createHouseholdSchema.safeParse({ name: "Hushåll" });
  assert.equal(implied.success, true);
  assert.equal(implied.success && implied.data.baseCurrency, "SEK");
});

test("the service refuses an unsupported currency even when the schema is bypassed", async () => {
  requireTestDatabase();
  const service = new HouseholdsService(new AuditService());
  const user = await owner();

  await assert.rejects(
    service.create(user.id, {
      name: "Eurohushåll",
      baseCurrency: "EUR" as "SEK",
    }),
    (error: unknown) => error instanceof UnsupportedHouseholdCurrencyException,
  );

  const db = getDb();
  const rows = await db
    .select({ id: households.id })
    .from(households)
    .where(eq(households.name, "Eurohushåll"));
  assert.equal(rows.length, 0, "nothing may be written when the currency is refused");
});

test("an empty legacy household can be migrated onto a supported currency", async () => {
  requireTestDatabase();
  const service = new HouseholdsService(new AuditService());
  const user = await owner();
  const db = getDb();

  // Exactly what onboarding used to be able to create.
  const [legacy] = await db
    .insert(households)
    .values({ name: `Legacy EUR ${suffix()}`, baseCurrency: "EUR" })
    .returning();
  await db
    .insert(householdMembers)
    .values({ householdId: legacy.id, userId: user.id, role: "OWNER" });

  const result = await service.migrateBaseCurrency(user.id, legacy.id, "SEK");
  assert.equal(result.changed, true);

  const [after] = await db
    .select({ baseCurrency: households.baseCurrency })
    .from(households)
    .where(eq(households.id, legacy.id))
    .limit(1);
  assert.equal(after?.baseCurrency, "SEK");

  const listed = await service.listForUser(user.id);
  assert.equal(listed.find((row) => row.id === legacy.id)?.currencySupported, true);
});

test("a household holding money is not silently re-denominated", async () => {
  requireTestDatabase();
  const service = new HouseholdsService(new AuditService());
  const user = await owner();
  const db = getDb();

  const [legacy] = await db
    .insert(households)
    .values({ name: `Legacy EUR money ${suffix()}`, baseCurrency: "EUR" })
    .returning();
  await db
    .insert(householdMembers)
    .values({ householdId: legacy.id, userId: user.id, role: "OWNER" });
  await db.insert(accounts).values({
    householdId: legacy.id,
    name: "Eurokonto",
    accountType: "CHECKING",
    currency: "EUR",
    openingBalanceMinor: 10000n,
    currentBalanceMinor: 10000n,
    isShared: true,
  });

  await assert.rejects(
    service.migrateBaseCurrency(user.id, legacy.id, "SEK"),
    (error: unknown) => {
      assert.ok(error instanceof ConflictException);
      const body = error.getResponse() as { code?: string };
      assert.equal(body.code, "CURRENCY_MIGRATION_UNSAFE");
      return true;
    },
    "100 EUR must not become 100 SEK by relabelling",
  );

  const [after] = await db
    .select({ baseCurrency: households.baseCurrency })
    .from(households)
    .where(eq(households.id, legacy.id))
    .limit(1);
  assert.equal(after?.baseCurrency, "EUR");
});

test("only an owner can change a household's currency", async () => {
  requireTestDatabase();
  const service = new HouseholdsService(new AuditService());
  const member = await owner();
  const db = getDb();

  const [legacy] = await db
    .insert(households)
    .values({ name: `Legacy EUR role ${suffix()}`, baseCurrency: "EUR" })
    .returning();
  await db
    .insert(householdMembers)
    .values({ householdId: legacy.id, userId: member.id, role: "ADMIN" });

  await assert.rejects(
    service.migrateBaseCurrency(member.id, legacy.id, "SEK"),
    (error: unknown) => error instanceof ForbiddenException,
  );
});

test("the household list says whether each household's currency is usable", async () => {
  requireTestDatabase();
  const service = new HouseholdsService(new AuditService());
  const user = await owner();
  const db = getDb();

  const supported = await service.create(user.id, { name: `Ok ${suffix()}`, baseCurrency: "SEK" });
  const [legacy] = await db
    .insert(households)
    .values({ name: `Legacy ${suffix()}`, baseCurrency: "NOK" })
    .returning();
  await db
    .insert(householdMembers)
    .values({ householdId: legacy.id, userId: user.id, role: "OWNER" });

  const listed = await service.listForUser(user.id);
  assert.equal(listed.find((row) => row.id === supported.id)?.currencySupported, true);
  assert.equal(listed.find((row) => row.id === legacy.id)?.currencySupported, false);
});
