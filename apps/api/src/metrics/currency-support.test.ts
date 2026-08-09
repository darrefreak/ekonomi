import assert from "node:assert/strict";
import test from "node:test";
import {
  activeCurrencyWarnings,
  assertAggregatableCurrency,
  partitionByAggregationCurrency,
  UnsupportedCurrencyException,
} from "./currency-support";

const account = (
  id: string,
  currency: string,
  archivedAt: Date | null = null,
) => ({ id, name: `Konto ${id}`, currency, archivedAt });

test("an account in the household currency is aggregatable", () => {
  const { aggregatable, unsupported } = partitionByAggregationCurrency(
    [account("a", "SEK"), account("b", "SEK")],
    "SEK",
  );
  assert.equal(aggregatable.length, 2);
  assert.deepEqual(unsupported, []);
});

test("an account in another currency is never summed into the total", () => {
  const { aggregatable, unsupported } = partitionByAggregationCurrency(
    [account("a", "SEK"), account("b", "EUR")],
    "SEK",
  );
  assert.deepEqual(
    aggregatable.map((a) => a.id),
    ["a"],
  );
  assert.deepEqual(unsupported, [
    { id: "b", name: "Konto b", currency: "EUR", archived: false },
  ]);
});

test("an archived foreign account is excluded from the total and from the warning", () => {
  const rows = [account("a", "SEK"), account("b", "EUR", new Date())];
  const { aggregatable, unsupported } = partitionByAggregationCurrency(rows, "SEK");
  assert.deepEqual(
    aggregatable.map((a) => a.id),
    ["a"],
    "an archived foreign account must not reach the aggregate",
  );
  assert.deepEqual(
    activeCurrencyWarnings(unsupported),
    [],
    "an archived account needs no action, so it must not nag",
  );
});

test("a household whose base currency is not SEK aggregates its own currency", () => {
  const { aggregatable, unsupported } = partitionByAggregationCurrency(
    [account("a", "EUR"), account("b", "SEK")],
    "EUR",
  );
  assert.deepEqual(
    aggregatable.map((a) => a.id),
    ["a"],
  );
  assert.equal(unsupported[0]?.currency, "SEK");
});

test("creating an account outside the household currency is refused, not accepted", () => {
  assert.doesNotThrow(() => assertAggregatableCurrency("SEK", "SEK"));
  let error: unknown;
  try {
    assertAggregatableCurrency("EUR", "SEK");
  } catch (thrown) {
    error = thrown;
  }
  assert.ok(error instanceof UnsupportedCurrencyException);
  assert.equal(error.getStatus(), 422);
  const body = error.getResponse() as { code: string; message: string };
  assert.equal(body.code, "UNSUPPORTED_ACCOUNT_CURRENCY");
  assert.match(body.message, /EUR/);
  assert.match(body.message, /SEK/);
});

test("the partition never loses an account", () => {
  const rows = [
    account("a", "SEK"),
    account("b", "EUR"),
    account("c", "NOK", new Date()),
    account("d", "SEK"),
  ];
  const { aggregatable, unsupported } = partitionByAggregationCurrency(rows, "SEK");
  assert.equal(
    aggregatable.length + unsupported.length,
    rows.length,
    "every account is either aggregated or reported; none may vanish",
  );
});
