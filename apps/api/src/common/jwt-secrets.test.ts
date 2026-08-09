import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  assertProductionSecret,
  InsecureSecretError,
  isProductionGradeSecret,
  requireAccessSecret,
} from "./jwt-secrets";
import {
  assertProductionConfiguration,
  checkProductionConfiguration,
  ProductionConfigurationError,
} from "./production-config";

const strongSecret = () => crypto.randomBytes(48).toString("base64");

function reasonFor(value: string | undefined): string {
  try {
    assertProductionSecret("JWT_ACCESS_SECRET", value);
  } catch (error) {
    assert.ok(error instanceof InsecureSecretError);
    return error.message;
  }
  return "";
}

test("the placeholders this repository publishes are refused in production", () => {
  // These are the exact strings the acceptance audit used to forge a token.
  for (const published of [
    "dev-access-secret-change-me",
    "dev-refresh-secret-change-me",
    "test-access-secret",
    "test-refresh-secret",
  ]) {
    const reason = reasonFor(published);
    assert.notEqual(reason, "", `${published} must be refused`);
    assert.ok(
      !reason.includes(published),
      "the rejection reason must not echo the secret into the logs",
    );
  }
});

test("length alone no longer buys acceptance", () => {
  // Long, and still hopeless. The old guard accepted anything past 16 chars.
  for (const value of [
    "dev-access-secret-change-me-but-much-longer-than-before",
    "this-is-a-placeholder-value-for-production-use",
    "your-secret-key-goes-right-here-in-production",
    "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ]) {
    assert.notEqual(
      reasonFor(value),
      "",
      `${value.slice(0, 20)}... must be refused despite its length`,
    );
  }
});

test("a short secret is refused even when it is random", () => {
  assert.match(reasonFor(crypto.randomBytes(9).toString("hex")), /characters/);
});

test("a malformed secret is refused", () => {
  assert.match(reasonFor(`  ${strongSecret()}  `), /whitespace/);
  assert.match(reasonFor(`${strongSecret()} extra`), /whitespace/);
  assert.match(reasonFor(`${strongSecret()}\n`), /whitespace/);
});

test("a missing secret is refused", () => {
  assert.match(reasonFor(undefined), /not set/);
  assert.match(reasonFor(""), /not set/);
});

test("generated random material is accepted", () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const secret = strongSecret();
    assert.ok(
      isProductionGradeSecret(secret),
      `openssl-style output must be accepted, rejected: ${reasonFor(secret)}`,
    );
  }
  assert.ok(isProductionGradeSecret(crypto.randomBytes(32).toString("hex")));
});

test("requireAccessSecret fails closed in production and never falls back", () => {
  const previousEnv = process.env.NODE_ENV;
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  try {
    process.env.NODE_ENV = "production";

    delete process.env.JWT_ACCESS_SECRET;
    assert.throws(() => requireAccessSecret(), InsecureSecretError);

    process.env.JWT_ACCESS_SECRET = "dev-access-secret-change-me";
    assert.throws(
      () => requireAccessSecret(),
      InsecureSecretError,
      "the published placeholder must not sign production tokens",
    );

    const good = strongSecret();
    process.env.JWT_ACCESS_SECRET = good;
    assert.equal(requireAccessSecret(), good);
  } finally {
    process.env.NODE_ENV = previousEnv;
    if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousSecret;
  }
});

test("development still works without configuration", () => {
  const previousEnv = process.env.NODE_ENV;
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  try {
    process.env.NODE_ENV = "development";
    delete process.env.JWT_ACCESS_SECRET;
    assert.equal(requireAccessSecret().length > 0, true);
  } finally {
    process.env.NODE_ENV = previousEnv;
    if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousSecret;
  }
});

const productionEnv = (overrides: Record<string, string | undefined> = {}) => ({
  NODE_ENV: "production",
  JWT_ACCESS_SECRET: strongSecret(),
  DATABASE_URL: "postgresql://ffos:strong@db.internal:5432/ffos",
  REDIS_URL: "redis://cache.internal:6379",
  CORS_ORIGIN: "https://app.example.se",
  S3_ENDPOINT: "https://storage.example.se",
  S3_ACCESS_KEY: "AKIAEXAMPLEKEY",
  S3_SECRET_KEY: strongSecret(),
  S3_BUCKET: "ffos-documents",
  ...overrides,
}) as NodeJS.ProcessEnv;

test("a complete production environment is accepted", () => {
  assert.deepEqual(checkProductionConfiguration(productionEnv()), []);
  assert.doesNotThrow(() => assertProductionConfiguration(productionEnv()));
});

test("every missing piece of the contract is reported at once", () => {
  const problems = checkProductionConfiguration({
    NODE_ENV: "production",
  } as NodeJS.ProcessEnv);
  for (const name of [
    "JWT_ACCESS_SECRET",
    "DATABASE_URL",
    "REDIS_URL",
    "CORS_ORIGIN",
    "S3_ENDPOINT",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "S3_BUCKET",
  ]) {
    assert.ok(
      problems.some((problem) => problem.includes(name)),
      `${name} must be reported as missing`,
    );
  }
});

test("production refuses to start on a published secret", () => {
  const env = productionEnv({ JWT_ACCESS_SECRET: "dev-access-secret-change-me" });
  assert.throws(
    () => assertProductionConfiguration(env),
    ProductionConfigurationError,
  );
});

test("an unused refresh secret still may not be a published placeholder", () => {
  const problems = checkProductionConfiguration(
    productionEnv({ JWT_REFRESH_SECRET: "dev-refresh-secret-change-me" }),
  );
  assert.ok(problems.some((problem) => problem.includes("JWT_REFRESH_SECRET")));
  assert.deepEqual(
    checkProductionConfiguration(
      productionEnv({ JWT_REFRESH_SECRET: strongSecret() }),
    ),
    [],
  );
});

test("a wide-open or local origin is refused in production", () => {
  assert.ok(
    checkProductionConfiguration(productionEnv({ CORS_ORIGIN: "*" })).some((p) =>
      p.includes("CORS_ORIGIN"),
    ),
  );
  assert.ok(
    checkProductionConfiguration(
      productionEnv({ CORS_ORIGIN: "http://localhost:3000" }),
    ).some((p) => p.includes("localhost")),
  );
});

test("destructive reset permission is refused in production", () => {
  assert.ok(
    checkProductionConfiguration(
      productionEnv({ FFOS_ALLOW_DB_RESET: "true" }),
    ).some((p) => p.includes("FFOS_ALLOW_DB_RESET")),
  );
});

test("the contract is not enforced outside production", () => {
  assert.doesNotThrow(() =>
    assertProductionConfiguration({ NODE_ENV: "development" } as NodeJS.ProcessEnv),
  );
  assert.doesNotThrow(() =>
    assertProductionConfiguration({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
  );
});
