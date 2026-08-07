import assert from "node:assert/strict";
import { test } from "node:test";
import { money } from "@ffos/domain";
import { formatMoney } from "./format-money";

test("formats SEK with Swedish locale", () => {
  const text = formatMoney(money(482143900n, "SEK"), "sv-SE");
  assert.match(text, /4[\s\u00a0]821[\s\u00a0]439/);
  assert.match(text, /kr/);
});
