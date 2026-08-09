import assert from "node:assert/strict";
import test from "node:test";
import {
  monthBoundsFor,
  monthLabelOf,
  SIMPLE_BUDGET_GROUPS,
} from "./budget-defaults";

test("month bounds cover the whole month, including February in a leap year", () => {
  assert.deepEqual(monthBoundsFor("2026-08"), {
    start: "2026-08-01",
    end: "2026-08-31",
  });
  assert.deepEqual(monthBoundsFor("2026-02"), {
    start: "2026-02-01",
    end: "2026-02-28",
  });
  assert.deepEqual(monthBoundsFor("2028-02"), {
    start: "2028-02-01",
    end: "2028-02-29",
  });
  assert.deepEqual(monthBoundsFor("2026-04"), {
    start: "2026-04-01",
    end: "2026-04-30",
  });
});

test("an impossible month label is refused rather than silently shifted", () => {
  assert.throws(() => monthBoundsFor("2026-13"));
  assert.throws(() => monthBoundsFor("2026-00"));
  assert.throws(() => monthBoundsFor("nonsense"));
});

test("a date belongs to its own month", () => {
  assert.equal(monthLabelOf("2026-08-09"), "2026-08");
  assert.equal(monthLabelOf("2026-12-31"), "2026-12");
  assert.equal(monthLabelOf("2027-01-01"), "2027-01");
});

test("the default groups are the ones the product already classifies spend into", () => {
  const keys = SIMPLE_BUDGET_GROUPS.map((group) => group.categoryKey);
  assert.deepEqual(keys, [
    "housing",
    "food",
    "transport",
    "family",
    "lifestyle",
    "other",
  ]);
  assert.equal(
    keys[keys.length - 1],
    "other",
    "the catch-all must sort last so it collects what the named groups do not",
  );
  assert.equal(
    new Set(keys).size,
    keys.length,
    "a duplicate key would make two lines fight over the same spend",
  );
});
