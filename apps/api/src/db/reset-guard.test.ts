import assert from "node:assert/strict";
import { test } from "node:test";
import { describeDatabaseTarget, DatabaseTargetError } from "./database-target";
import {
  assertDatabaseResetAllowed,
  DatabaseResetRefused,
  type ResetGuardEnv,
} from "./reset-guard";

const HOST = "postgresql://ffos:hunter2@localhost:5436";

function env(overrides: Partial<ResetGuardEnv> = {}): ResetGuardEnv {
  return {
    NODE_ENV: "development",
    DATABASE_URL: `${HOST}/ffos_test`,
    FFOS_ALLOW_DB_RESET: "true",
    ...overrides,
  };
}

function refusal(overrides: Partial<ResetGuardEnv>, options = {}) {
  try {
    assertDatabaseResetAllowed(env(overrides), options);
  } catch (err) {
    if (err instanceof DatabaseResetRefused || err instanceof DatabaseTargetError) {
      return err.message;
    }
    throw err;
  }
  return null;
}

test("a test database with explicit permission is allowed, non-interactively", () => {
  const target = assertDatabaseResetAllowed(env({ NODE_ENV: "test" }));
  assert.equal(target.database, "ffos_test");
  assert.equal(target.kind, "test");
});

test("a development database needs the operator to name it", () => {
  const message = refusal({ DATABASE_URL: `${HOST}/ffos_dev` });
  assert.match(message ?? "", /without confirmation/i);
  assert.match(message ?? "", /FFOS_DB_RESET_CONFIRM=ffos_dev/);

  const named = assertDatabaseResetAllowed(
    env({ DATABASE_URL: `${HOST}/ffos_dev`, FFOS_DB_RESET_CONFIRM: "ffos_dev" }),
  );
  assert.equal(named.kind, "development");

  const withFlag = assertDatabaseResetAllowed(
    env({ DATABASE_URL: `${HOST}/ffos_dev` }),
    { assumeYes: true },
  );
  assert.equal(withFlag.kind, "development");
});

test("naming the wrong database does not count as confirmation", () => {
  const message = refusal({
    DATABASE_URL: `${HOST}/ffos_dev`,
    FFOS_DB_RESET_CONFIRM: "ffos_test",
  });
  assert.match(message ?? "", /without confirmation/i);
});

test("production-like targets are refused", () => {
  for (const name of [
    "ffos_production",
    "ffos_prod",
    "ffos_staging",
    "ffos_live",
    "pilot_data",
    "customer_ledger",
    // A protected marker wins even when the name also ends in _test.
    "prod_test",
  ]) {
    const message = refusal({ DATABASE_URL: `${HOST}/${name}` });
    assert.match(message ?? "", /protected pattern/i, name);
  }
});

test("a production host is refused even with a disposable database name", () => {
  const message = refusal({
    DATABASE_URL: "postgresql://ffos:hunter2@db.production.internal:5432/ffos_test",
  });
  assert.match(message ?? "", /protected pattern/i);
});

test("unknown database names are refused", () => {
  for (const name of ["ffos", "postgres", "app", "ffos_devx", "testing"]) {
    const message = refusal({ DATABASE_URL: `${HOST}/${name}` });
    assert.match(message ?? "", /_dev or _test/, name);
  }
});

test("NODE_ENV=production is refused before anything else is considered", () => {
  const message = refusal({ NODE_ENV: "production" });
  assert.match(message ?? "", /NODE_ENV is production/);
});

test("permission must be granted explicitly", () => {
  assert.match(refusal({ FFOS_ALLOW_DB_RESET: undefined }) ?? "", /FFOS_ALLOW_DB_RESET/);
  assert.match(refusal({ FFOS_ALLOW_DB_RESET: "1" }) ?? "", /FFOS_ALLOW_DB_RESET/);
  assert.match(refusal({ FFOS_ALLOW_DB_RESET: "yes" }) ?? "", /FFOS_ALLOW_DB_RESET/);
});

test("missing or malformed URLs are refused", () => {
  assert.match(refusal({ DATABASE_URL: undefined }) ?? "", /not set/i);
  assert.match(refusal({ DATABASE_URL: "" }) ?? "", /not set/i);
  assert.match(refusal({ DATABASE_URL: "not a url" }) ?? "", /valid URL/i);
  assert.match(refusal({ DATABASE_URL: "mysql://x/ffos_test" }) ?? "", /postgres URL/i);
  assert.match(refusal({ DATABASE_URL: `${HOST}/` }) ?? "", /no database name/i);
});

test("guard output never contains credentials", () => {
  const messages = [
    refusal({ DATABASE_URL: `${HOST}/ffos_production` }),
    refusal({ DATABASE_URL: `${HOST}/unknowndb` }),
    refusal({ DATABASE_URL: `${HOST}/ffos_dev` }),
    refusal({ FFOS_ALLOW_DB_RESET: undefined }),
    assertDatabaseResetAllowed(env({ NODE_ENV: "test" })).describe(),
  ];
  for (const message of messages) {
    assert.ok(message, "expected a message");
    assert.ok(!message.includes("hunter2"), `password leaked: ${message}`);
    assert.ok(!message.includes("ffos:"), `credentials leaked: ${message}`);
  }
});

test("target descriptions carry host, database and classification only", () => {
  const target = describeDatabaseTarget(`${HOST}/ffos_test`);
  assert.equal(target.describe(), "ffos_test at localhost:5436 (test)");
});
