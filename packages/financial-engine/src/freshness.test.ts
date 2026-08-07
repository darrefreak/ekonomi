import assert from "node:assert/strict";
import { test } from "node:test";
import { computeFreshnessLabel, summarizeFreshness } from "./freshness";

test("computeFreshnessLabel uses connection status before age", () => {
  assert.equal(
    computeFreshnessLabel({
      lastSyncedAt: "2026-08-01T10:00:00.000Z",
      connectionStatus: "AUTH_REQUIRED",
      asOf: "2026-08-01",
    }),
    "omautentisering krävs",
  );
  assert.equal(
    computeFreshnessLabel({
      lastSyncedAt: null,
      connectionStatus: "DISCONNECTED",
      asOf: "2026-08-01",
    }),
    "frånkopplad",
  );
});

test("computeFreshnessLabel ages from asOf clock", () => {
  assert.equal(
    computeFreshnessLabel({
      lastSyncedAt: "2026-08-01T11:59:00.000Z",
      connectionStatus: "CONNECTED",
      asOf: "2026-08-01",
    }),
    "just nu",
  );
  assert.equal(
    computeFreshnessLabel({
      lastSyncedAt: "2026-07-25T12:00:00.000Z",
      connectionStatus: "CONNECTED",
      asOf: "2026-08-01",
    }),
    "7 d sedan",
  );
});

test("summarizeFreshness prefers auth and staleness honesty", () => {
  assert.equal(
    summarizeFreshness(
      [
        {
          connectionStatus: "CONNECTED",
          freshnessLabel: null,
          lastSyncedAt: "2026-08-01T11:00:00.000Z",
        },
        {
          connectionStatus: "AUTH_REQUIRED",
          freshnessLabel: null,
          lastSyncedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
      "2026-08-01",
    ),
    "omautentisering krävs",
  );
  assert.equal(
    summarizeFreshness(
      [
        {
          connectionStatus: "CONNECTED",
          freshnessLabel: null,
          lastSyncedAt: "2026-07-20T12:00:00.000Z",
        },
      ],
      "2026-08-01",
    ),
    "föråldrad data",
  );
});
