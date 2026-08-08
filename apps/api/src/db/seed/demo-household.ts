import { createHash } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { money } from "@ffos/domain";
import {
  buildAssetDepreciation,
  buildCashExpense,
  buildCashRefund,
  buildCreditCardPayment,
  buildCreditCardPurchase,
  buildFinancedAssetPurchase,
  buildIncome,
  buildInternalTransfer,
  buildInvestmentTransfer,
  buildMortgagePayment,
  calculateNetWorth,
  reconstructBalances,
} from "@ffos/financial-engine";
import { getDb } from "../client";
import { householdMembers, households, users } from "../schema";
import {
  accountBalanceSnapshots,
  accounts,
  categories,
  dataSources,
  financialEvents,
  importBatches,
  ledgerPostings,
  merchants,
  rawImportRecords,
} from "../schema-economic";
import { householdSettings, notifications } from "../schema-ops";
import { addDays, eachMonth, formatDate, parseDate } from "./dates";
import { persistBalancedEvent } from "./persist-event";
import { createSeededRng, pick, randInt } from "./rng";
import { seedPlanningData } from "./seed-planning";
import { seedVehiclesData } from "./seed-vehicles";
import { seedDecisionsData } from "./seed-decisions";
import { seedVehicleIntelData } from "./seed-vehicle-intel";
import { seedIntakeData } from "./seed-intake";

const DEMO_EMAIL = "demo@ffos.local";
const DEMO_PASSWORD = "demo-password-123";

type CatMap = Record<string, string>;

async function seedCategories(householdId: string): Promise<CatMap> {
  const db = getDb();
  const defs = [
    { key: "housing", name: "Boende", kind: "expense" },
    { key: "housing.mortgage_interest", name: "Bolåneränta", kind: "expense" },
    { key: "housing.electricity", name: "El", kind: "expense" },
    { key: "housing.insurance", name: "Hemförsäkring", kind: "expense" },
    { key: "food", name: "Mat", kind: "expense" },
    { key: "food.groceries", name: "Matvaror", kind: "expense" },
    { key: "food.restaurant", name: "Restaurang", kind: "expense" },
    { key: "transport", name: "Transport", kind: "expense" },
    { key: "transport.fuel", name: "Drivmedel", kind: "expense" },
    { key: "family", name: "Familj", kind: "expense" },
    { key: "lifestyle", name: "Livsstil", kind: "expense" },
    { key: "lifestyle.subscriptions", name: "Abonnemang", kind: "expense" },
    { key: "income.salary", name: "Lön", kind: "income" },
    { key: "income.benefits", name: "Bidrag", kind: "income" },
  ];
  const map: CatMap = {};
  for (const def of defs) {
    const [row] = await db
      .insert(categories)
      .values({
        householdId,
        key: def.key,
        name: def.name,
        kind: def.kind,
        isSystem: true,
      })
      .returning();
    map[def.key] = row.id;
  }
  return map;
}

export async function seedDemoHousehold() {
  const asOf = process.env.DEMO_AS_OF_DATE ?? "2026-08-01";
  const seedKey = process.env.DEMO_RANDOM_SEED ?? "family-financial-os-demo-v1";
  const rng = createSeededRng(seedKey);
  const db = getDb();

  // Remove previous demo household cascade
  const existingUsers = await db
    .select()
    .from(users)
    .where(eq(users.email, DEMO_EMAIL))
    .limit(1);
  if (existingUsers[0]) {
    const memberships = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.userId, existingUsers[0].id));
    for (const m of memberships) {
      await db.delete(households).where(eq(households.id, m.householdId));
    }
    await db.delete(users).where(eq(users.id, existingUsers[0].id));
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const [user] = await db
    .insert(users)
    .values({
      email: DEMO_EMAIL,
      passwordHash,
      displayName: "Alex Demo",
    })
    .returning();

  const [household] = await db
    .insert(households)
    .values({ name: "Familjen Demo", baseCurrency: "SEK" })
    .returning();

  const [owner] = await db
    .insert(householdMembers)
    .values({
      householdId: household.id,
      userId: user.id,
      role: "OWNER",
      personalDataPolicy: "FULL_DETAILS",
    })
    .returning();

  await db.insert(householdSettings).values({
    householdId: household.id,
    locale: "sv-SE",
    appearance: "system",
    minimumCashBalanceMinor: 6_000_000n,
    emergencyFundTargetMinor: 12_000_000n,
    safetyMarginMinor: 2_000_000n,
    currency: "SEK",
  });

  await db.insert(notifications).values([
    {
      householdId: household.id,
      type: "ACTION_REQUIRED",
      title: "Granska nya poster",
      body: "Det finns rader i granskningskön som behöver klassificeras.",
      href: "/review",
    },
    {
      householdId: household.id,
      type: "INFO",
      title: "Demodata laddad",
      body: "Använd Cmd/Ctrl+K för global sök. Rapporter finns under Rapporter.",
      href: "/reports",
    },
  ]);

  const cats = await seedCategories(household.id);

  const [sebSource] = await db
    .insert(dataSources)
    .values({
      householdId: household.id,
      providerId: "mock-seb",
      name: "SEB",
      domain: "BANKING",
      protocol: "OPEN_BANKING_MOCK",
      authenticationMethod: "BANKID_MOCK",
      connectionStatus: "CONNECTED",
      lastSyncedAt: new Date(`${asOf}T10:00:00.000Z`),
      freshnessLabel: null,
    })
    .returning();

  const [sbabSource] = await db
    .insert(dataSources)
    .values({
      householdId: household.id,
      providerId: "mock-sbab",
      name: "SBAB",
      domain: "BANKING",
      protocol: "OPEN_BANKING_MOCK",
      authenticationMethod: "BANKID_MOCK",
      connectionStatus: "AUTH_REQUIRED",
      lastSyncedAt: new Date(`${asOf}T12:00:00.000Z`),
      freshnessLabel: null,
    })
    .returning();
  // Stale sync before asOf (for honest freshness after reconnect/seed)
  await db
    .update(dataSources)
    .set({ lastSyncedAt: addDays(parseDate(asOf), -14) })
    .where(eq(dataSources.id, sbabSource.id));

  const [avanzaSource] = await db
    .insert(dataSources)
    .values({
      householdId: household.id,
      providerId: "mock-avanza",
      name: "Avanza",
      domain: "INVESTMENTS",
      protocol: "API_MOCK",
      authenticationMethod: "OAUTH_MOCK",
      connectionStatus: "CONNECTED",
      lastSyncedAt: addDays(parseDate(asOf), -2),
      freshnessLabel: null,
    })
    .returning();

  await db.insert(dataSources).values({
    householdId: household.id,
    providerId: "mock-kivra",
    name: "Kivra",
    domain: "DOCUMENTS",
    protocol: "API_MOCK",
    authenticationMethod: "OAUTH_MOCK",
    connectionStatus: "DISCONNECTED",
    lastSyncedAt: null,
    freshnessLabel: null,
  });

  const [batch] = await db
    .insert(importBatches)
    .values({
      householdId: household.id,
      sourceId: sebSource.id,
      status: "RUNNING",
    })
    .returning();

  await db.insert(importBatches).values({
    householdId: household.id,
    sourceId: sbabSource.id,
    startedAt: addDays(parseDate(asOf), -14),
    completedAt: addDays(parseDate(asOf), -14),
    status: "PARTIAL",
    totalRecords: 12,
    createdCount: 8,
    updatedCount: 2,
    ignoredCount: 1,
    failedCount: 1,
  });

  await db.insert(importBatches).values({
    householdId: household.id,
    sourceId: avanzaSource.id,
    startedAt: addDays(parseDate(asOf), -2),
    completedAt: addDays(parseDate(asOf), -2),
    status: "COMPLETED",
    totalRecords: 5,
    createdCount: 5,
    updatedCount: 0,
    ignoredCount: 0,
    failedCount: 0,
  });

  const mkAccount = async (values: typeof accounts.$inferInsert) => {
    const [row] = await db.insert(accounts).values(values).returning();
    return row;
  };

  const seb = await mkAccount({
    householdId: household.id,
    name: "SEB Lönekonton",
    provider: "SEB",
    ownerMemberId: owner.id,
    isShared: false,
    accountType: "CHECKING",
    externalReference: "SEB-DEMO-001",
    sourceId: sebSource.id,
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    reportedBalanceMinor: 0n,
  });
  // Vehicle financed purchase: down payment + later principal paydown funded via joint opening
  // (historical, not period income). Price/finance match seed-vehicles metadata.
  const vehiclePurchasePriceMinor = 389_000_00n;
  const vehicleDownPaymentMinor = 109_000_00n; // 389k − 280k financed principal
  const vehicleLoanPaydownMinor = 85_000_00n; // 280k → 195k remaining
  const vehicleCashFundingMinor =
    vehicleDownPaymentMinor + vehicleLoanPaydownMinor;
  const vehicleDepreciationMinor = 109_000_00n; // 389k → valuation mid 280k
  const joint = await mkAccount({
    householdId: household.id,
    name: "Gemensamt konto",
    provider: "SEB",
    isShared: true,
    accountType: "CHECKING",
    externalReference: "SEB-DEMO-JOINT",
    sourceId: sebSource.id,
    openingBalanceMinor: vehicleCashFundingMinor,
    currentBalanceMinor: vehicleCashFundingMinor,
    reportedBalanceMinor: vehicleCashFundingMinor,
  });
  const sbab = await mkAccount({
    householdId: household.id,
    name: "SBAB Sparkonto",
    provider: "SBAB",
    isShared: true,
    accountType: "SAVINGS",
    externalReference: "SBAB-DEMO-SAV",
    sourceId: sbabSource.id,
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    reportedBalanceMinor: 0n,
    connectionStatus: "AUTH_REQUIRED",
  });
  const mortgage = await mkAccount({
    householdId: household.id,
    name: "SBAB Bolån",
    provider: "SBAB",
    isShared: true,
    accountType: "MORTGAGE",
    externalReference: "SBAB-DEMO-MTG",
    sourceId: sbabSource.id,
    openingBalanceMinor: 3_900_000_00n,
    currentBalanceMinor: 3_900_000_00n,
    reportedBalanceMinor: 3_900_000_00n,
    interestRateBps: 240,
    bindingEndDate: "2027-06-30",
    connectionStatus: "AUTH_REQUIRED",
  });
  const revolut = await mkAccount({
    householdId: household.id,
    name: "Revolut",
    provider: "Revolut",
    ownerMemberId: owner.id,
    isShared: false,
    accountType: "CHECKING",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    reportedBalanceMinor: 0n,
  });
  const creditCard = await mkAccount({
    householdId: household.id,
    name: "Kreditkort",
    provider: "SEB",
    isShared: true,
    accountType: "CREDIT_CARD",
    creditLimitMinor: 50_000_00n,
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    reportedBalanceMinor: 0n,
  });
  // Opening includes prior market value; seed transfers add contributions.
  const avanzaOpening = 1_060_000_00n;
  const avanza = await mkAccount({
    householdId: household.id,
    name: "Avanza ISK",
    provider: "Avanza",
    isShared: true,
    accountType: "INVESTMENT",
    sourceId: avanzaSource.id,
    openingBalanceMinor: avanzaOpening,
    currentBalanceMinor: avanzaOpening,
    reportedBalanceMinor: avanzaOpening,
  });
  const home = await mkAccount({
    householdId: household.id,
    name: "Bostad",
    accountType: "ASSET",
    isShared: true,
    isSystem: false,
    openingBalanceMinor: 6_800_000_00n,
    currentBalanceMinor: 6_800_000_00n,
    reportedBalanceMinor: 6_800_000_00n,
  });
  // Vehicle: opening 0 + financed purchase 389k → depreciation 109k (= valuation mid 280k).
  const vehicle = await mkAccount({
    householdId: household.id,
    name: "Familjebil",
    accountType: "ASSET",
    isShared: true,
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    reportedBalanceMinor: 0n,
  });
  const carLoan = await mkAccount({
    householdId: household.id,
    name: "Billån Santander",
    provider: "Santander",
    isShared: true,
    accountType: "LOAN",
    externalReference: "CAR-LOAN-DEMO",
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
    reportedBalanceMinor: 0n,
    interestRateBps: 495,
  });
  const expenseBook = await mkAccount({
    householdId: household.id,
    name: "Utgiftsbok",
    accountType: "EXPENSE",
    isSystem: true,
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
  });
  const incomeBook = await mkAccount({
    householdId: household.id,
    name: "Inkomstbok",
    accountType: "INCOME",
    isSystem: true,
    openingBalanceMinor: 0n,
    currentBalanceMinor: 0n,
  });

  const merchantRows = [
    { name: "ICA Maxi", aliases: ["ICA MAXI HANINGE", "ICA MAXI 1234"], cat: "food.groceries" },
    { name: "Netflix", aliases: ["NETFLIX.COM"], cat: "lifestyle.subscriptions" },
    { name: "Circle K", aliases: ["CIRCLE K", "ST1"], cat: "transport.fuel" },
    { name: "Vattenfall", aliases: ["VATTENFALL AB"], cat: "housing.electricity" },
    { name: "Trygg-Hansa", aliases: ["TRYGG HANSA"], cat: "housing.insurance" },
  ] as const;

  const merchantIds: Record<string, string> = {};
  for (const m of merchantRows) {
    const [row] = await db
      .insert(merchants)
      .values({
        householdId: household.id,
        canonicalName: m.name,
        aliases: [...m.aliases],
        merchantCategory: m.cat,
        confidence: "0.96",
      })
      .returning();
    merchantIds[m.name] = row.id;
  }

  const asOfDate = parseDate(asOf);
  const start = addDays(addMonthsSafe(asOfDate, -23), 0);
  const months = eachMonth(start, asOfDate);

  let netflixPrice = 179_00n;
  let eventCount = 0;

  for (const month of months) {
    const y = month.getUTCFullYear();
    const m = month.getUTCMonth();
    const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;

    // Salaries (25th)
    const salaryDate = formatDate(new Date(Date.UTC(y, m, 25)));
    if (parseDate(salaryDate) <= asOfDate) {
      await persistBalancedEvent({
        householdId: household.id,
        draft: buildIncome({
          cashAccountId: seb.id,
          incomeAccountId: incomeBook.id,
          amountMinor: 42_600_00n,
          currency: "SEK",
        }),
        occurredOn: salaryDate,
        description: "Lön Alex",
        incomeAmountMinor: 42_600_00n,
        categoryId: cats["income.salary"],
        sourceAccountId: seb.id,
        sourceAmountMinor: 42_600_00n,
        importBatchId: batch.id,
        externalId: `salary-alex-${monthKey}`,
      });
      await persistBalancedEvent({
        householdId: household.id,
        draft: buildIncome({
          cashAccountId: joint.id,
          incomeAccountId: incomeBook.id,
          amountMinor: 38_200_00n,
          currency: "SEK",
        }),
        occurredOn: salaryDate,
        description: "Lön Sam",
        incomeAmountMinor: 38_200_00n,
        categoryId: cats["income.salary"],
        sourceAccountId: joint.id,
        sourceAmountMinor: 38_200_00n,
        importBatchId: batch.id,
        externalId: `salary-sam-${monthKey}`,
      });
      eventCount += 2;
    }

    // Barnbidrag (20th)
    const benefitDate = formatDate(new Date(Date.UTC(y, m, 20)));
    if (parseDate(benefitDate) <= asOfDate) {
      await persistBalancedEvent({
        householdId: household.id,
        draft: buildIncome({
          cashAccountId: joint.id,
          incomeAccountId: incomeBook.id,
          amountMinor: 1_250_00n,
          currency: "SEK",
        }),
        occurredOn: benefitDate,
        description: "Barnbidrag",
        incomeAmountMinor: 1_250_00n,
        categoryId: cats["income.benefits"],
        sourceAccountId: joint.id,
        sourceAmountMinor: 1_250_00n,
        importBatchId: batch.id,
        externalId: `benefit-${monthKey}`,
      });
      eventCount += 1;
    }

    // Mortgage 12th: 10k principal + 8k interest (slight variation)
    const mortgageDate = formatDate(new Date(Date.UTC(y, m, 12)));
    if (parseDate(mortgageDate) <= asOfDate) {
      const interest = 7_800_00n + BigInt(randInt(rng, 0, 400)) * 100n;
      const principal = 10_000_00n;
      await persistBalancedEvent({
        householdId: household.id,
        draft: buildMortgagePayment({
          cashAccountId: joint.id,
          mortgageAccountId: mortgage.id,
          interestExpenseAccountId: expenseBook.id,
          principalMinor: principal,
          interestMinor: interest,
          currency: "SEK",
        }),
        occurredOn: mortgageDate,
        description: "Bolån SBAB",
        categoryId: cats["housing.mortgage_interest"],
        sourceAccountId: joint.id,
        sourceAmountMinor: -(principal + interest),
        importBatchId: batch.id,
        externalId: `mortgage-${monthKey}`,
        splits: [
          {
            categoryId: cats["housing.mortgage_interest"],
            amountMinor: interest,
            memo: "interest",
          },
          {
            categoryId: cats["housing.mortgage_interest"],
            amountMinor: principal,
            memo: "principal",
          },
        ],
      });
      eventCount += 1;
    }

    // Internal transfer SEB → SBAB on 26th (both bank legs + reconciliation)
    const transferDate = formatDate(new Date(Date.UTC(y, m, 26)));
    if (parseDate(transferDate) <= asOfDate) {
      const groupId = deterministicUuid(seedKey, `transfer-${monthKey}`);
      await persistBalancedEvent({
        householdId: household.id,
        draft: buildInternalTransfer({
          fromAccountId: seb.id,
          toAccountId: sbab.id,
          amountMinor: 20_000_00n,
          currency: "SEK",
        }),
        occurredOn: transferDate,
        description: "Intern överföring till SBAB",
        sourceAccountId: seb.id,
        sourceAmountMinor: -20_000_00n,
        isInternalTransfer: true,
        transferGroupId: groupId,
        importBatchId: batch.id,
        externalId: `transfer-out-${monthKey}`,
        counterpartTx: {
          accountId: sbab.id,
          amountMinor: 20_000_00n,
          externalId: `transfer-in-${monthKey}`,
        },
        createReconciliationGroup: true,
      });
      eventCount += 1;
    }

    // Investment transfer quarterly-ish
    if (m % 3 === 0) {
      const investDate = formatDate(new Date(Date.UTC(y, m, 27)));
      if (parseDate(investDate) <= asOfDate) {
        await persistBalancedEvent({
          householdId: household.id,
          draft: buildInvestmentTransfer({
            cashAccountId: sbab.id,
            investmentAccountId: avanza.id,
            amountMinor: 15_000_00n,
            currency: "SEK",
          }),
          occurredOn: investDate,
          description: "Överföring till Avanza",
          sourceAccountId: sbab.id,
          sourceAmountMinor: -15_000_00n,
          importBatchId: batch.id,
          externalId: `invest-${monthKey}`,
        });
        eventCount += 1;
      }
    }

    // Electricity seasonality
    const elecDate = formatDate(new Date(Date.UTC(y, m, 8)));
    if (parseDate(elecDate) <= asOfDate) {
      const winterBoost = m <= 2 || m >= 10 ? 1.45 : m >= 5 && m <= 7 ? 0.75 : 1;
      const elec = BigInt(Math.round(1900 * winterBoost)) * 100n;
      await persistBalancedEvent({
        householdId: household.id,
        draft: buildCashExpense({
          cashAccountId: joint.id,
          expenseAccountId: expenseBook.id,
          amountMinor: elec,
          currency: "SEK",
        }),
        occurredOn: elecDate,
        description: "Vattenfall el",
        categoryId: cats["housing.electricity"],
        merchantId: merchantIds["Vattenfall"],
        sourceAccountId: joint.id,
        sourceAmountMinor: -elec,
        importBatchId: batch.id,
        externalId: `elec-${monthKey}`,
      });
      eventCount += 1;
    }

    // Netflix with price increases
    if (monthKey === "2025-03") netflixPrice = 199_00n;
    if (monthKey === "2025-11") netflixPrice = 219_00n;
    const subDate = formatDate(new Date(Date.UTC(y, m, 3)));
    if (parseDate(subDate) <= asOfDate) {
      await persistBalancedEvent({
        householdId: household.id,
        draft: buildCashExpense({
          cashAccountId: revolut.id,
          expenseAccountId: expenseBook.id,
          amountMinor: netflixPrice,
          currency: "SEK",
        }),
        occurredOn: subDate,
        description: "Netflix",
        categoryId: cats["lifestyle.subscriptions"],
        merchantId: merchantIds.Netflix,
        sourceAccountId: revolut.id,
        sourceAmountMinor: -netflixPrice,
        importBatchId: batch.id,
        externalId: `netflix-${monthKey}`,
      });
      eventCount += 1;
    }

    // Annual insurance in August
    if (m === 7) {
      const insDate = formatDate(new Date(Date.UTC(y, m, 18)));
      if (parseDate(insDate) <= asOfDate) {
        await persistBalancedEvent({
          householdId: household.id,
          draft: buildCashExpense({
            cashAccountId: joint.id,
            expenseAccountId: expenseBook.id,
            amountMinor: 11_600_00n,
            currency: "SEK",
          }),
          occurredOn: insDate,
          description: "Trygg-Hansa årspremie",
          categoryId: cats["housing.insurance"],
          merchantId: merchantIds["Trygg-Hansa"],
          sourceAccountId: joint.id,
          sourceAmountMinor: -11_600_00n,
          importBatchId: batch.id,
          externalId: `insurance-${monthKey}`,
        });
        eventCount += 1;
      }
    }

    // Groceries ~4x / month via credit card + payment
    for (let week = 0; week < 4; week += 1) {
      const day = 4 + week * 7;
      const grocDate = formatDate(new Date(Date.UTC(y, m, Math.min(day, 28))));
      if (parseDate(grocDate) > asOfDate) continue;
      const amount = BigInt(randInt(rng, 900, 1600)) * 100n;
      // Lifestyle creep: last 3 months higher
      const monthsFromEnd =
        (asOfDate.getUTCFullYear() - y) * 12 + (asOfDate.getUTCMonth() - m);
      const creep = monthsFromEnd <= 2 ? 1.14 : 1;
      const finalAmount = BigInt(Math.round(Number(amount) * creep));

      await persistBalancedEvent({
        householdId: household.id,
        draft: buildCreditCardPurchase({
          expenseAccountId: expenseBook.id,
          creditCardAccountId: creditCard.id,
          amountMinor: finalAmount,
          currency: "SEK",
        }),
        occurredOn: grocDate,
        description: pick(rng, ["ICA Maxi", "ICA MAXI HANINGE", "ICA MAXI 1234"]),
        categoryId: cats["food.groceries"],
        merchantId: merchantIds["ICA Maxi"],
        sourceAccountId: creditCard.id,
        sourceAmountMinor: -finalAmount,
        importBatchId: batch.id,
        externalId: `groc-${monthKey}-w${week}`,
      });
      eventCount += 1;
    }

    // Pay credit card around 28th
    const ccPayDate = formatDate(new Date(Date.UTC(y, m, 28)));
    if (parseDate(ccPayDate) <= asOfDate) {
      const payAmount = 5_000_00n + BigInt(randInt(rng, 0, 2000)) * 100n;
      await persistBalancedEvent({
        householdId: household.id,
        draft: buildCreditCardPayment({
          cashAccountId: joint.id,
          creditCardAccountId: creditCard.id,
          amountMinor: payAmount,
          currency: "SEK",
        }),
        occurredOn: ccPayDate,
        description: "Betalning kreditkort",
        sourceAccountId: joint.id,
        sourceAmountMinor: -payAmount,
        importBatchId: batch.id,
        externalId: `ccpay-${monthKey}`,
      });
      eventCount += 1;
    }

    // Fuel
    const fuelDate = formatDate(new Date(Date.UTC(y, m, 15)));
    if (parseDate(fuelDate) <= asOfDate) {
      const fuel = BigInt(randInt(rng, 700, 1100)) * 100n;
      await persistBalancedEvent({
        householdId: household.id,
        draft: buildCashExpense({
          cashAccountId: revolut.id,
          expenseAccountId: expenseBook.id,
          amountMinor: fuel,
          currency: "SEK",
        }),
        occurredOn: fuelDate,
        description: "Circle K",
        categoryId: cats["transport.fuel"],
        merchantId: merchantIds["Circle K"],
        sourceAccountId: revolut.id,
        sourceAmountMinor: -fuel,
        importBatchId: batch.id,
        externalId: `fuel-${monthKey}`,
      });
      eventCount += 1;
    }

    // July vacation spike
    if (m === 6) {
      const vacDate = formatDate(new Date(Date.UTC(y, m, 10)));
      if (parseDate(vacDate) <= asOfDate) {
        await persistBalancedEvent({
          householdId: household.id,
          draft: buildCashExpense({
            cashAccountId: joint.id,
            expenseAccountId: expenseBook.id,
            amountMinor: 18_500_00n,
            currency: "SEK",
          }),
          occurredOn: vacDate,
          description: "Sommarresa",
          categoryId: cats.lifestyle,
          sourceAccountId: joint.id,
          sourceAmountMinor: -18_500_00n,
          importBatchId: batch.id,
          externalId: `vacation-${monthKey}`,
        });
        eventCount += 1;
      }
    }
  }

  // Anomaly: unusually large unknown purchase near asOf
  await persistBalancedEvent({
    householdId: household.id,
    draft: buildCashExpense({
      cashAccountId: seb.id,
      expenseAccountId: expenseBook.id,
      amountMinor: 12_400_00n,
      currency: "SEK",
    }),
    occurredOn: formatDate(addDays(asOfDate, -5)),
    description: "Swish till Okänd",
    categoryId: cats.lifestyle,
    sourceAccountId: seb.id,
    sourceAmountMinor: -12_400_00n,
    importBatchId: batch.id,
    externalId: "anomaly-swish-1",
  });
  eventCount += 1;

  // Refund example — nets spending (expenseAmountMinor negative)
  await persistBalancedEvent({
    householdId: household.id,
    draft: buildCashRefund({
      cashAccountId: joint.id,
      expenseAccountId: expenseBook.id,
      amountMinor: 420_00n,
      currency: "SEK",
    }),
    occurredOn: formatDate(addDays(asOfDate, -9)),
    description: "ICA retur / återbetalning",
    categoryId: cats["food.groceries"],
    merchantId: merchantIds["ICA Maxi"],
    sourceAccountId: joint.id,
    sourceAmountMinor: 420_00n,
    importBatchId: batch.id,
    externalId: "refund-ica-1",
  });
  eventCount += 1;

  // Raw record sample
  const payload = { provider: "mock-seb", note: "demo raw payload", asOf };
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  await db.insert(rawImportRecords).values({
    householdId: household.id,
    provider: "mock-seb",
    sourceId: sebSource.id,
    importBatchId: batch.id,
    payload,
    hash,
    processingStatus: "COMPLETED",
    schemaVersion: "1",
  });

  // Financed vehicle purchase (runtime path), historical principal paydown, then write-down 389k → 280k.
  await persistBalancedEvent({
    householdId: household.id,
    draft: buildFinancedAssetPurchase({
      cashAccountId: joint.id,
      assetAccountId: vehicle.id,
      loanAccountId: carLoan.id,
      purchasePriceMinor: vehiclePurchasePriceMinor,
      downPaymentMinor: vehicleDownPaymentMinor,
      currency: "SEK",
    }),
    occurredOn: "2022-04-15",
    description: "Köp familjebil finansierat (demo)",
    sourceAccountId: joint.id,
    sourceAmountMinor: -vehicleDownPaymentMinor,
    externalId: "seed-vehicle-financed-purchase-2022-04",
    importBatchId: batch.id,
    vehicleId: undefined,
  });
  eventCount += 1;

  await persistBalancedEvent({
    householdId: household.id,
    draft: buildMortgagePayment({
      cashAccountId: joint.id,
      mortgageAccountId: carLoan.id,
      interestExpenseAccountId: expenseBook.id,
      principalMinor: vehicleLoanPaydownMinor,
      interestMinor: 0n,
      currency: "SEK",
    }),
    occurredOn: "2026-03-15",
    description: "Billån amortering historisk (demo)",
    sourceAccountId: joint.id,
    sourceAmountMinor: -vehicleLoanPaydownMinor,
    externalId: "seed-vehicle-loan-paydown-2026-03",
    importBatchId: batch.id,
  });
  eventCount += 1;

  await persistBalancedEvent({
    householdId: household.id,
    draft: buildAssetDepreciation({
      assetAccountId: vehicle.id,
      expenseAccountId: expenseBook.id,
      amountMinor: vehicleDepreciationMinor,
      currency: "SEK",
    }),
    occurredOn: "2026-07-31",
    description: "Värdeminskning fordon (demo)",
    externalId: "seed-vehicle-depreciation-2026-07",
    importBatchId: batch.id,
  });
  eventCount += 1;

  // Ending balances = opening + ledger postings (source of truth)
  const openings = [
    { accountId: seb.id, accountType: "CHECKING", openingMinor: 0n },
    {
      accountId: joint.id,
      accountType: "CHECKING",
      openingMinor: vehicleCashFundingMinor,
    },
    { accountId: sbab.id, accountType: "SAVINGS", openingMinor: 0n },
    { accountId: revolut.id, accountType: "CHECKING", openingMinor: 0n },
    { accountId: creditCard.id, accountType: "CREDIT_CARD", openingMinor: 0n },
    {
      accountId: avanza.id,
      accountType: "INVESTMENT",
      openingMinor: avanzaOpening,
    },
    {
      accountId: mortgage.id,
      accountType: "MORTGAGE",
      openingMinor: 3_900_000_00n,
    },
    { accountId: home.id, accountType: "ASSET", openingMinor: 6_800_000_00n },
    {
      accountId: vehicle.id,
      accountType: "ASSET",
      openingMinor: 0n,
    },
    {
      accountId: carLoan.id,
      accountType: "LOAN",
      openingMinor: 0n,
    },
    { accountId: expenseBook.id, accountType: "EXPENSE", openingMinor: 0n },
    { accountId: incomeBook.id, accountType: "INCOME", openingMinor: 0n },
  ];
  const postingRows = await db
    .select({
      accountId: ledgerPostings.accountId,
      side: ledgerPostings.side,
      amountMinor: ledgerPostings.amountMinor,
    })
    .from(ledgerPostings)
    .where(eq(ledgerPostings.householdId, household.id));
  const ledgerBalances = reconstructBalances({
    openings,
    postings: postingRows.map((p) => ({
      accountId: p.accountId,
      side: p.side,
      amountMinor: p.amountMinor,
    })),
  });

  for (const opening of openings) {
    if (opening.accountType === "EXPENSE" || opening.accountType === "INCOME") {
      continue;
    }
    const bal = ledgerBalances.get(opening.accountId) ?? opening.openingMinor;
    // Persist opening + reported (= ledger) so demo accounts reconcile MATCHED.
    // currentBalanceMinor is a derived cache of ledger truth only.
    await db
      .update(accounts)
      .set({
        openingBalanceMinor: opening.openingMinor,
        currentBalanceMinor: bal,
        reportedBalanceMinor: bal,
        lastSyncedAt: asOfDate,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, opening.accountId));
    await db.insert(accountBalanceSnapshots).values({
      householdId: household.id,
      accountId: opening.accountId,
      reportedBalanceMinor: bal,
      availableBalanceMinor: bal,
      ledgerCalculatedBalanceMinor: bal,
      reconciledBalanceMinor: bal,
      asOf: asOfDate,
      source: "ledger_reconstruct",
      confidence: "1",
      userVerified: true,
      isEstimated: false,
    });
  }

  const sumType = (...types: string[]) =>
    openings
      .filter((o) => types.includes(o.accountType))
      .reduce(
        (acc, o) => acc + (ledgerBalances.get(o.accountId) ?? o.openingMinor),
        0n,
      );
  const startingCashMinor = sumType("CHECKING", "SAVINGS", "CASH");
  const startingNetWorth = calculateNetWorth({
    cash: money(startingCashMinor, "SEK"),
    investments: money(sumType("INVESTMENT", "PENSION", "CRYPTO"), "SEK"),
    assets: money(sumType("ASSET"), "SEK"),
    liabilities: money(sumType("MORTGAGE", "LOAN", "CREDIT_CARD"), "SEK"),
  });

  await db
    .update(importBatches)
    .set({
      status: "COMPLETED",
      completedAt: new Date(),
      totalRecords: eventCount,
      createdCount: eventCount,
    })
    .where(eq(importBatches.id, batch.id));

  await seedPlanningData({
    householdId: household.id,
    asOf,
    cats,
    merchantIds,
    savingsAccountId: sbab.id,
  });

  const vehicleSeed = await seedVehiclesData({
    householdId: household.id,
    asOf,
    assetAccountId: vehicle.id,
    loanAccountId: carLoan.id,
  });

  // Link demo fuel expenses + financed purchase to the household vehicle (ledger ↔ vehicleId).
  if (vehicleSeed?.vehicleId) {
    await db
      .update(financialEvents)
      .set({ vehicleId: vehicleSeed.vehicleId })
      .where(
        and(
          eq(financialEvents.householdId, household.id),
          eq(financialEvents.description, "Circle K"),
        ),
      );
    await db
      .update(financialEvents)
      .set({ vehicleId: vehicleSeed.vehicleId })
      .where(
        and(
          eq(financialEvents.householdId, household.id),
          eq(
            financialEvents.description,
            "Köp familjebil finansierat (demo)",
          ),
        ),
      );
  }

  await seedDecisionsData({
    householdId: household.id,
    asOf,
    startingCashMinor,
    startingNetWorthMinor: startingNetWorth.amountMinor,
    monthlyNetSavingsMinor: 35_000_00n,
  });

  await seedVehicleIntelData({
    householdId: household.id,
    asOf,
  });

  await seedIntakeData({
    householdId: household.id,
    asOf,
  });

  // Ensure no orphan query warnings
  await db.execute(sql`select 1`);

  return {
    userId: user.id,
    householdId: household.id,
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    asOf,
    seedKey,
    eventCount,
  };
}

function addMonthsSafe(d: Date, months: number): Date {
  const next = new Date(d);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function deterministicUuid(seed: string, label: string): string {
  const hex = createHash("sha256").update(`${seed}:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
