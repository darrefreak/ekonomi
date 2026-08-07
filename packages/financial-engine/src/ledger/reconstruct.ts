export type AccountBalanceClass = "asset" | "liability" | "nominal";

export function accountBalanceClass(accountType: string): AccountBalanceClass {
  if (
    accountType === "MORTGAGE" ||
    accountType === "LOAN" ||
    accountType === "CREDIT_CARD"
  ) {
    return "liability";
  }
  if (accountType === "EXPENSE" || accountType === "INCOME") {
    return "nominal";
  }
  return "asset";
}

/** Signed balance delta for one posting given account class. */
export function postingBalanceDelta(input: {
  side: "debit" | "credit";
  amountMinor: bigint;
  balanceClass: AccountBalanceClass;
}): bigint {
  // Asset/nominal: debit increases, credit decreases.
  // Liability: credit increases owed balance, debit decreases.
  const assetSigned =
    input.side === "debit" ? input.amountMinor : -input.amountMinor;
  if (input.balanceClass === "liability") return -assetSigned;
  return assetSigned;
}

export type OpeningBalance = {
  accountId: string;
  accountType: string;
  openingMinor: bigint;
};

export type PostedLine = {
  accountId: string;
  side: "debit" | "credit";
  amountMinor: bigint;
};

/**
 * Reconstruct account balances from openings + ledger postings.
 * Returns every accountId seen in openings or postings.
 */
export function reconstructBalances(input: {
  openings: OpeningBalance[];
  postings: PostedLine[];
}): Map<string, bigint> {
  const typeById = new Map(
    input.openings.map((o) => [o.accountId, o.accountType] as const),
  );
  const balances = new Map<string, bigint>();
  for (const o of input.openings) {
    balances.set(o.accountId, o.openingMinor);
  }
  for (const p of input.postings) {
    const accountType = typeById.get(p.accountId) ?? "OTHER";
    const klass = accountBalanceClass(accountType);
    const prev = balances.get(p.accountId) ?? 0n;
    balances.set(
      p.accountId,
      prev +
        postingBalanceDelta({
          side: p.side,
          amountMinor: p.amountMinor,
          balanceClass: klass,
        }),
    );
  }
  return balances;
}

export type BalanceMismatch = {
  accountId: string;
  cachedMinor: bigint;
  ledgerMinor: bigint;
  deltaMinor: bigint;
};

export function findBalanceMismatches(input: {
  cached: Array<{ accountId: string; balanceMinor: bigint }>;
  ledger: Map<string, bigint>;
}): BalanceMismatch[] {
  const mismatches: BalanceMismatch[] = [];
  for (const row of input.cached) {
    const ledgerMinor = input.ledger.get(row.accountId) ?? 0n;
    if (ledgerMinor !== row.balanceMinor) {
      mismatches.push({
        accountId: row.accountId,
        cachedMinor: row.balanceMinor,
        ledgerMinor,
        deltaMinor: row.balanceMinor - ledgerMinor,
      });
    }
  }
  return mismatches;
}
