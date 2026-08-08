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
  },
  categories: {
    all: (householdId: string, includeArchived?: boolean) =>
      ["categories", householdId, { includeArchived: Boolean(includeArchived) }] as const,
  },
  merchants: {
    all: (householdId: string) => ["merchants", householdId] as const,
  },
  privacy: {
    requests: (householdId: string) => ["privacy", householdId, "requests"] as const,
  },
} as const;
