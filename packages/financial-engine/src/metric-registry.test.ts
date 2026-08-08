import assert from "node:assert/strict";
import { test } from "node:test";
import {
  METRIC_BUNDLE_VERSION,
  getMetricDefinition,
  listMetricDefinitions,
  metricCatalogCalculationVersion,
  metricInputHash,
  metricVersionsMap,
  requireMetricDefinition,
} from "./metric-registry";

test("metric registry lists unique versioned definitions", () => {
  const defs = listMetricDefinitions();
  assert.ok(defs.length >= 10);
  const keys = new Set(defs.map((d) => d.metricKey));
  assert.equal(keys.size, defs.length);
  for (const d of defs) {
    assert.ok(d.calculationVersion.length > 0);
    assert.ok(d.formulaDescription.length > 10);
  }
  assert.equal(METRIC_BUNDLE_VERSION, "1.0.0");
  assert.equal(getMetricDefinition("net_worth")?.metricKey, "net_worth");
  assert.equal(getMetricDefinition("nope"), null);
  assert.equal(requireMetricDefinition("debt_total").valueKind, "money_minor");
});

test("metricInputHash is stable for same inputs", () => {
  const a = metricInputHash(["h1", "2026-08-01", 100n, 50n]);
  const b = metricInputHash(["h1", "2026-08-01", 100n, 50n]);
  const c = metricInputHash(["h1", "2026-08-01", 101n, 50n]);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("catalog calculationVersion is not the bundle semver", () => {
  const catalog = metricCatalogCalculationVersion();
  assert.notEqual(catalog, METRIC_BUNDLE_VERSION);
  assert.match(catalog, /^fnv1a_/);
  const versions = metricVersionsMap();
  assert.equal(versions.net_worth, "1.0.0");
  assert.equal(versions.debt_total, "1.0.0");
});
