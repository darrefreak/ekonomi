/**
 * Centralized TanStack Query keys. Keep hierarchical so invalidation can
 * target a whole domain (e.g. `queryKeys.accounts.all(householdId)`) or a
 * single record (e.g. `queryKeys.accounts.detail(householdId, accountId)`).
 */
export const queryKeys = {
  accounts: {
    all: (householdId: string, includeArchived?: boolean) =>
      ["accounts", householdId, { includeArchived: Boolean(includeArchived) }] as const,
    detail: (householdId: string, accountId: string) =>
      ["accounts", householdId, "detail", accountId] as const,
  },
  transactions: {
    all: (
      householdId: string,
      filters?: Record<string, string | boolean | undefined>,
    ) => ["transactions", householdId, filters ?? {}] as const,
    detail: (householdId: string, transactionId: string) =>
      ["transactions", householdId, "detail", transactionId] as const,
  },
  dashboard: {
    all: (householdId: string) => ["dashboard", householdId] as const,
  },
  netWorth: {
    all: (householdId: string) => ["net-worth", householdId] as const,
  },
  debt: {
    all: (householdId: string) => ["debt", householdId] as const,
  },
  investments: {
    all: (householdId: string) => ["investments", householdId] as const,
  },
  cashflow: {
    all: (householdId: string) => ["cashflow", householdId] as const,
  },
  budget: {
    all: (householdId: string) => ["budget", householdId] as const,
  },
  review: {
    all: (householdId: string) => ["review", householdId] as const,
  },
  metrics: {
    all: (householdId: string) => ["metrics", householdId] as const,
  },
  goals: {
    all: (householdId: string) => ["goals", householdId] as const,
  },
  settings: {
    all: (householdId: string) => ["settings", householdId] as const,
    auditLogs: (householdId: string) => ["settings", householdId, "audit"] as const,
    analysisRuns: (householdId: string) =>
      ["settings", householdId, "analysis-runs"] as const,
  },
  anomalies: {
    all: (householdId: string) => ["anomalies", householdId] as const,
  },
  subscriptions: {
    all: (householdId: string) => ["subscriptions", householdId] as const,
  },
  categories: {
    all: (householdId: string, includeArchived?: boolean) =>
      ["categories", householdId, { includeArchived: Boolean(includeArchived) }] as const,
  },
  merchants: {
    all: (householdId: string) => ["merchants", householdId] as const,
    search: (householdId: string, q?: string) =>
      ["merchants", householdId, { q: q ?? "" }] as const,
  },
  privacy: {
    requests: (householdId: string) => ["privacy", householdId, "requests"] as const,
  },
  intelligence: {
    review: (householdId: string) => ["intelligence", householdId, "review"] as const,
    rules: (householdId: string) => ["intelligence", householdId, "rules"] as const,
    recurring: (householdId: string) =>
      ["intelligence", householdId, "recurring"] as const,
    expected: (householdId: string) =>
      ["intelligence", householdId, "expected"] as const,
  },
} as const;

/**
 * Everything an imported bank statement can change.
 *
 * A statement import writes financial events, so almost every financial surface
 * is downstream of it: balances, transaction lists, the dashboard, net worth,
 * cashflow, the budget's actuals, review items, insights and merchant history.
 * Listing them in one place keeps a caller from inventing its own subset and
 * leaving a stale screen behind — and is narrower than invalidating everything.
 */
export const FINANCIAL_IMPORT_QUERY_ROOTS = [
  "accounts",
  "transactions",
  "dashboard",
  "net-worth",
  "cashflow",
  "budget",
  "debt",
  "investments",
  "review",
  "metrics",
  "goals",
  "anomalies",
  "subscriptions",
  "merchants",
  "imports",
] as const;

/**
 * Invalidate the surfaces an import touches, for one household.
 *
 * Deliberately keyed on the household so another household's cached data is not
 * discarded, and deliberately root-scoped so a detail view refreshes with its
 * list.
 */
export async function invalidateAfterFinancialImport(
  queryClient: {
    invalidateQueries: (filters: { queryKey: readonly unknown[] }) => Promise<void>;
  },
  householdId: string,
): Promise<void> {
  await Promise.all(
    FINANCIAL_IMPORT_QUERY_ROOTS.map((root) =>
      queryClient.invalidateQueries({ queryKey: [root, householdId] }),
    ),
  );
}
