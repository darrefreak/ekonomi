import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ErasureLedgerUnavailable,
  erasureLedgerFile,
  recordErasure,
} from "./erasure-ledger";

/**
 * The ledger that keeps a restore from undoing an erasure.
 *
 * The behaviour that matters is not the happy path but the two edges: it must
 * refuse to pretend when it cannot write, and it must hold identifiers only.
 */

function tombstone(householdId = "11111111-1111-4111-8111-111111111111") {
  return {
    householdId,
    requestId: "22222222-2222-4222-8222-222222222222",
    erasedAt: "2026-08-09T12:00:00.000Z",
    objects: [{ bucket: "ffos-pilot", storageKey: `households/${householdId}/documents/a.txt` }],
  };
}

test("with no ledger configured it does nothing rather than failing", () => {
  assert.equal(erasureLedgerFile({}), null);
  assert.equal(recordErasure(tombstone(), {}), "not-configured");
});

test("an erasure is appended as one line per erasure", () => {
  const dir = mkdtempSync(join(tmpdir(), "ffos-ledger-"));
  try {
    const env = { FFOS_ERASURE_LEDGER_DIR: dir };
    assert.equal(recordErasure(tombstone("aaaaaaaa-1111-4111-8111-111111111111"), env), "recorded");
    assert.equal(recordErasure(tombstone("bbbbbbbb-2222-4222-8222-222222222222"), env), "recorded");

    const lines = readFileSync(join(dir, "erasures.jsonl"), "utf8").split("\n").filter(Boolean);
    assert.equal(lines.length, 2, "append-only: one line per erasure, nothing overwritten");
    const first = JSON.parse(lines[0]);
    assert.equal(first.householdId, "aaaaaaaa-1111-4111-8111-111111111111");
    assert.equal(first.objects.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the ledger directory is created when it does not exist yet", () => {
  const parent = mkdtempSync(join(tmpdir(), "ffos-ledger-"));
  try {
    const dir = join(parent, "nested", "ledger");
    assert.equal(recordErasure(tombstone(), { FFOS_ERASURE_LEDGER_DIR: dir }), "recorded");
    assert.ok(readFileSync(join(dir, "erasures.jsonl"), "utf8").includes("erasedAt"));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("a ledger that cannot be written throws, so the erasure stops instead of pretending", () => {
  const dir = mkdtempSync(join(tmpdir(), "ffos-ledger-"));
  try {
    chmodSync(dir, 0o500); // readable and traversable, not writable
    assert.throws(
      () => recordErasure(tombstone(), { FFOS_ERASURE_LEDGER_DIR: dir }),
      (error: unknown) => error instanceof ErasureLedgerUnavailable,
      "an unrecordable erasure must fail closed: the rows are still there and it can be retried",
    );
  } finally {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a tombstone carries identifiers and nothing about the participant", () => {
  const dir = mkdtempSync(join(tmpdir(), "ffos-ledger-"));
  try {
    recordErasure(tombstone(), { FFOS_ERASURE_LEDGER_DIR: dir });
    const written = readFileSync(join(dir, "erasures.jsonl"), "utf8");
    const parsed = JSON.parse(written.trim());

    assert.deepEqual(
      Object.keys(parsed).sort(),
      ["erasedAt", "householdId", "objects", "requestId"],
      "no field beyond the four identifiers may be recorded",
    );
    assert.deepEqual(Object.keys(parsed.objects[0]).sort(), ["bucket", "storageKey"]);
    for (const forbidden of ["name", "amount", "email", "description", "personnummer"]) {
      assert.ok(!written.toLowerCase().includes(forbidden), `${forbidden} must not appear`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
