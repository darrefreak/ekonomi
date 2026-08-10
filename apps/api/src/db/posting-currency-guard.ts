import { inArray } from "drizzle-orm";
import {
  assertSupportedHouseholdCurrency,
  CurrencyQuarantineException,
  UnsupportedCurrencyException,
  type AggregationCurrency,
} from "../common/currency-policy";
import type { DbExecutor } from "./client";
import { households } from "./schema";
import { accounts } from "./schema-economic";

/**
 * The currency invariant, enforced where postings are actually written.
 *
 * Eleven endpoints build ledger drafts and every one of them took the currency
 * from its own request body, defaulting to SEK, without ever comparing it with
 * the account being posted to. So a household could hold an account in one
 * currency and receive postings in another: the income statement moved, the
 * balance sheet did not, and the independent oracle's ACC-005 broke (FPR-002).
 *
 * Guarding each endpoint would leave the twelfth unguarded. This runs inside the
 * persistence transaction instead, so no caller — endpoint, importer, seed or
 * job — can write a currency-invalid posting, whatever it believes it is doing.
 */

export type GuardedPosting = {
  accountId: string;
  currency: string;
};

export class PostingAccountNotInHouseholdError extends Error {
  readonly code = "POSTING_ACCOUNT_NOT_IN_HOUSEHOLD";
  constructor(accountId: string) {
    super(`Account ${accountId} does not belong to this household.`);
    this.name = "PostingAccountNotInHouseholdError";
  }
}

/**
 * Check every posting against its account and the household, and return the
 * household's base currency so the caller can stamp the rows it writes with a
 * value that was verified rather than assumed.
 *
 * Rejects, in this order:
 *   1. a household base currency V1 cannot aggregate,
 *   2. a posting aimed at an account of another household,
 *   3. an account whose own currency is not the household's — quarantined, so
 *      it takes no money until it is archived or repaired,
 *   4. a posting whose currency is not the account's.
 */
export async function assertPostingCurrencyInvariant(
  db: DbExecutor,
  householdId: string,
  postings: readonly GuardedPosting[],
): Promise<AggregationCurrency> {
  const [household] = await db
    .select({ baseCurrency: households.baseCurrency })
    .from(households)
    .where(inArray(households.id, [householdId]))
    .limit(1);

  const baseCurrency = household?.baseCurrency ?? "SEK";
  assertSupportedHouseholdCurrency(baseCurrency);

  const accountIds = [...new Set(postings.map((posting) => posting.accountId))];
  if (accountIds.length === 0) return baseCurrency;

  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      currency: accounts.currency,
      householdId: accounts.householdId,
    })
    .from(accounts)
    .where(inArray(accounts.id, accountIds));

  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const posting of postings) {
    const account = byId.get(posting.accountId);
    if (!account || account.householdId !== householdId) {
      throw new PostingAccountNotInHouseholdError(posting.accountId);
    }
    if (account.currency !== baseCurrency) {
      throw new CurrencyQuarantineException({
        accountId: account.id,
        accountName: account.name,
        accountCurrency: account.currency,
        baseCurrency,
      });
    }
    if (posting.currency !== account.currency) {
      throw new UnsupportedCurrencyException(posting.currency, account.currency);
    }
  }

  return baseCurrency;
}
