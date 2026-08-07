import assert from "node:assert/strict";
import { test } from "node:test";
import { explainFromTools } from "./ai-tools";

test("advisor prose cites tool outputs", () => {
  const brief = explainFromTools([
    {
      tool: "get_budget",
      ok: true,
      data: { remainingMinor: "10000", utilizationPercent: 80, period: "2026-07" },
    },
    {
      tool: "get_opportunities",
      ok: true,
      data: { topTitle: "Förhandla bolåneränta", annualSavingMinor: "980000" },
    },
  ]);
  assert.match(brief.sections[0]!.detail, /2026-07/);
  assert.match(brief.sections[1]!.detail, /Förhandla/);
  assert.match(brief.disclaimer, /deterministiska|financial-engine/i);
});
