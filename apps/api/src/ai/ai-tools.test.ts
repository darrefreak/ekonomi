import assert from "node:assert/strict";
import { test } from "node:test";
import {
  answerFromTools,
  explainFromTools,
  formatMinorSek,
  selectToolsForMessage,
} from "./ai-tools";

test("formatMinorSek formats ore as kronor", () => {
  assert.match(formatMinorSek("980000"), /9[\s\u00a0]?800/);
});

test("advisor prose cites tool outputs with SEK and citations", () => {
  const brief = explainFromTools([
    {
      tool: "get_budget",
      ok: true,
      data: { remainingMinor: "10000", utilizationPercent: 80, period: "2026-07" },
    },
    {
      tool: "get_opportunities",
      ok: true,
      data: {
        topTitle: "Förhandla bolåneränta",
        annualSavingMinor: "980000",
        evidence: [{ label: "Bolån", href: "/debt", kind: "account", id: "1" }],
      },
    },
  ]);
  assert.match(brief.sections[0]!.detail, /2026-07/);
  assert.match(brief.sections[0]!.detail, /kr/);
  assert.ok(!brief.sections[0]!.detail.includes("minor units"));
  assert.match(brief.sections[1]!.detail, /Förhandla/);
  assert.ok(brief.sections[1]!.citations.some((c) => c.href === "/debt"));
  assert.match(brief.disclaimer, /deterministiska|financial-engine|påhittade/i);
});

test("selectToolsForMessage maps intents", () => {
  assert.deepEqual(selectToolsForMessage("Hur ser budgeten ut?"), ["get_budget"]);
  assert.ok(selectToolsForMessage("Vilka risker har vi?").includes("get_risk"));
  assert.ok(
    selectToolsForMessage("Vad är vår nettoförmögenhet?").includes("get_net_worth"),
  );
});

test("answerFromTools never invents amounts outside tool data", () => {
  const answered = answerFromTools("budget", [
    {
      tool: "get_budget",
      ok: true,
      data: { remainingMinor: "250000", utilizationPercent: 50, period: "2026-08" },
    },
  ]);
  assert.match(answered.reply, /2[\s\u00a0]?500/);
  assert.ok(!answered.reply.includes("999999"));
  assert.deepEqual(answered.usedTools, ["get_budget"]);
});
