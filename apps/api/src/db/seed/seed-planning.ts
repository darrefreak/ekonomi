import { eachMonth } from "./dates";
import { getDb } from "../client";
import {
  budgetLines,
  budgetPeriods,
  contracts,
  goals,
  recurringItems,
  sinkingFunds,
  subscriptions,
} from "../schema-planning";

type SeedPlanningInput = {
  householdId: string;
  asOf: string;
  cats: Record<string, string>;
  merchantIds: Record<string, string>;
  savingsAccountId: string;
};

function monthBounds(label: string) {
  const [y, m] = label.split("-").map(Number);
  const start = `${label}-01`;
  const end =
    m === 12
      ? `${y}-12-31`
      : new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export async function seedPlanningData(input: SeedPlanningInput) {
  const db = getDb();
  const asOfDate = new Date(`${input.asOf}T00:00:00.000Z`);
  const start = new Date(asOfDate);
  start.setUTCMonth(start.getUTCMonth() - 2);
  const months = eachMonth(start, asOfDate).map((d) => {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  });

  const lineDefs = [
    { key: "housing", name: "Boende", planned: 22_000_00n, order: 1 },
    { key: "food", name: "Mat", planned: 8_500_00n, order: 2 },
    { key: "transport", name: "Transport", planned: 2_800_00n, order: 3 },
    { key: "family", name: "Familj", planned: 3_500_00n, order: 4 },
    { key: "lifestyle", name: "Livsstil", planned: 3_200_00n, order: 5 },
  ];

  for (const label of months) {
    const { start: startDate, end: endDate } = monthBounds(label);
    const [period] = await db
      .insert(budgetPeriods)
      .values({
        householdId: input.householdId,
        label,
        startDate,
        endDate,
        currency: "SEK",
        status: "ACTIVE",
      })
      .returning();

    for (const line of lineDefs) {
      // July vacation month gets a higher lifestyle allowance to still show overspend
      const planned =
        label === "2026-07" && line.key === "lifestyle"
          ? 18_000_00n
          : line.planned;
      await db.insert(budgetLines).values({
        householdId: input.householdId,
        budgetPeriodId: period.id,
        categoryId: input.cats[line.key],
        categoryKey: line.key,
        name: line.name,
        plannedMinor: planned,
        sortOrder: line.order,
      });
    }
  }

  await db.insert(subscriptions).values([
    {
      householdId: input.householdId,
      name: "Netflix",
      merchantId: input.merchantIds.Netflix,
      categoryId: input.cats["lifestyle.subscriptions"],
      cadence: "MONTHLY",
      amountMinor: 189_00n,
      currency: "SEK",
      status: "ACTIVE",
      firstDetectedOn: "2024-09-01",
      lastChargedOn: "2026-07-08",
      nextChargeOn: "2026-08-08",
      priceTrendPercent: "5.60",
      notes: "Prishöjningar synliga i seedhistorik",
    },
    {
      householdId: input.householdId,
      name: "Spotify Family",
      categoryId: input.cats["lifestyle.subscriptions"],
      cadence: "MONTHLY",
      amountMinor: 179_00n,
      currency: "SEK",
      status: "ACTIVE",
      firstDetectedOn: "2025-01-15",
      lastChargedOn: "2026-07-15",
      nextChargeOn: "2026-08-15",
      priceTrendPercent: "0",
    },
    {
      householdId: input.householdId,
      name: "iCloud+",
      cadence: "MONTHLY",
      amountMinor: 29_00n,
      currency: "SEK",
      status: "ACTIVE",
      firstDetectedOn: "2025-03-01",
      lastChargedOn: "2026-07-01",
      nextChargeOn: "2026-08-01",
      priceTrendPercent: "0",
    },
  ]);

  await db.insert(recurringItems).values([
    {
      householdId: input.householdId,
      name: "Lön Alex",
      kind: "income",
      cadence: "MONTHLY",
      amountMinor: 42_600_00n,
      categoryId: input.cats["income.salary"],
      status: "CONFIRMED",
      nextExpectedOn: "2026-08-25",
      lastSeenOn: "2026-07-25",
      confidence: "0.99",
    },
    {
      householdId: input.householdId,
      name: "Netflix",
      kind: "expense",
      cadence: "MONTHLY",
      amountMinor: 189_00n,
      categoryId: input.cats["lifestyle.subscriptions"],
      merchantId: input.merchantIds.Netflix,
      status: "CONFIRMED",
      nextExpectedOn: "2026-08-08",
      lastSeenOn: "2026-07-08",
      confidence: "0.97",
    },
    {
      householdId: input.householdId,
      name: "Vattenfall el",
      kind: "expense",
      cadence: "MONTHLY",
      amountMinor: 1_450_00n,
      categoryId: input.cats["housing.electricity"],
      merchantId: input.merchantIds.Vattenfall,
      status: "DETECTED",
      nextExpectedOn: "2026-08-20",
      lastSeenOn: "2026-07-20",
      confidence: "0.86",
      notes: "Säsongsvariation — bekräfta mönster",
    },
  ]);

  await db.insert(contracts).values([
    {
      householdId: input.householdId,
      provider: "Trygg-Hansa",
      contractType: "home_insurance",
      name: "Hemförsäkring",
      status: "ACTIVE",
      startDate: "2024-01-01",
      renewalDate: "2027-01-01",
      cancellationDeadline: "2026-12-01",
      noticePeriodDays: 30,
      monthlyCostMinor: 289_00n,
      annualCostMinor: 3_468_00n,
      autoRenewal: true,
    },
    {
      householdId: input.householdId,
      provider: "Vattenfall",
      contractType: "electricity",
      name: "Elavtal rörligt",
      status: "ENDING",
      startDate: "2025-03-01",
      endDate: "2026-09-30",
      renewalDate: "2026-10-01",
      cancellationDeadline: "2026-08-31",
      noticePeriodDays: 30,
      monthlyCostMinor: 1_450_00n,
      annualCostMinor: 17_400_00n,
      autoRenewal: true,
      notes: "Jämför innan förnyelse",
    },
    {
      householdId: input.householdId,
      provider: "SBAB",
      contractType: "mortgage",
      name: "Bolån 3-års bundet",
      status: "ACTIVE",
      startDate: "2024-06-01",
      bindingPeriodEnd: "2027-06-01",
      renewalDate: "2027-06-01",
      noticePeriodDays: 90,
      monthlyCostMinor: 15_800_00n,
      annualCostMinor: 189_600_00n,
      autoRenewal: false,
    },
  ]);

  const [vacationFund] = await db
    .insert(sinkingFunds)
    .values({
      householdId: input.householdId,
      name: "Semester 2027",
      categoryKey: "lifestyle",
      targetMinor: 40_000_00n,
      currentReservedMinor: 12_500_00n,
      monthlyContributionMinor: 2_500_00n,
      targetDate: "2027-06-01",
      priority: 2,
      linkedAccountId: input.savingsAccountId,
    })
    .returning();

  await db.insert(sinkingFunds).values({
    householdId: input.householdId,
    name: "Bilunderhåll",
    categoryKey: "transport",
    targetMinor: 20_000_00n,
    currentReservedMinor: 8_000_00n,
    monthlyContributionMinor: 1_000_00n,
    targetDate: "2027-01-01",
    priority: 3,
    linkedAccountId: input.savingsAccountId,
  });

  await db.insert(goals).values([
    {
      householdId: input.householdId,
      name: "Buffert 3 månader",
      goalType: "EMERGENCY_FUND",
      status: "ACTIVE",
      targetMinor: 150_000_00n,
      currentMinor: 98_000_00n,
      monthlyContributionMinor: 4_000_00n,
      targetDate: "2027-03-01",
      priority: 1,
    },
    {
      householdId: input.householdId,
      name: "Italienresa",
      goalType: "TRAVEL",
      status: "ACTIVE",
      targetMinor: 40_000_00n,
      currentMinor: 12_500_00n,
      monthlyContributionMinor: 2_500_00n,
      targetDate: "2027-06-01",
      priority: 2,
      sinkingFundId: vacationFund.id,
    },
    {
      householdId: input.householdId,
      name: "Extra amortering",
      goalType: "DEBT_FREE",
      status: "ACTIVE",
      targetMinor: 100_000_00n,
      currentMinor: 22_000_00n,
      monthlyContributionMinor: 3_000_00n,
      targetDate: "2028-01-01",
      priority: 2,
    },
  ]);
}
