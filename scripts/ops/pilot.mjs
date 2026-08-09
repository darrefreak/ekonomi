#!/usr/bin/env node
/**
 * Pilot preflight and daily check.
 *
 * Both are read-only: they observe, they never write financial data. The
 * difference is when they run. Preflight answers "may real data be entered into
 * this system at all", and every mandatory answer must be yes or the command
 * exits non-zero. The daily check answers "is the running pilot still healthy",
 * and is meant to be cheap enough to run every morning.
 *
 *   pnpm pilot:preflight
 *   pnpm pilot:check
 */

import { existsSync, statSync, accessSync, constants } from "node:fs";
import { join } from "node:path";
import {
  aws,
  assertKnownEnvironment,
  backupRoot,
  bad,
  bucketExists,
  bucketSafety,
  databaseKind,
  describeDatabase,
  die,
  heading,
  line,
  listBackups,
  loadContext,
  note,
  ok,
  psqlValue,
  ROOT,
  tombstonePath,
} from "./lib.mjs";

const command = process.argv[2] ?? "preflight";
const env = loadContext();
assertKnownEnvironment(env);

const results = [];
/** @param {"mandatory"|"advisory"} weight */
function record(weight, passed, text, detail = "") {
  results.push({ weight, passed, text, detail });
  if (passed) ok(text, detail);
  else if (weight === "mandatory") bad(text, detail);
  else console.log(`  ! ${text}${detail ? ` — ${detail}` : ""}`);
}

const mandatory = (passed, text, detail) => record("mandatory", passed, text, detail);
const advisory = (passed, text, detail) => record("advisory", passed, text, detail);

/* ------------------------------------------------------------- identity */

const db = describeDatabase(env.DATABASE_URL);

heading(`Pilot ${command === "check" ? "daily check" : "preflight"}`);
line("Environment", env.APP_ENV);
line("Database host", db ? `${db.host}:${db.port}` : "(unset)");
line("Database name", db ? db.database : "(unset)");
line("Object storage", env.S3_ENDPOINT ?? "(unset)");
line("Bucket", env.S3_BUCKET ?? "(unset)");
line("Backup directory", env.FFOS_BACKUP_DIR ?? "(unset)");
line("Erasure ledger", env.FFOS_ERASURE_LEDGER_DIR ?? "(unset)");
note("No secret, password or connection string is printed by this command.");

/* ------------------------------------------------------------- database */

heading("Database");

mandatory(Boolean(db), "DATABASE_URL names a database", db ? db.describe() : "not set or unparseable");

if (db) {
  const kind = databaseKind(db.database);
  if (env.APP_ENV === "pilot") {
    mandatory(
      kind === "protected",
      "the pilot points at a pilot database, not a development or test one",
      `${db.database} classifies as ${kind}` +
        (kind === "protected" ? ", which the reset guard refuses to drop" : ""),
    );
    mandatory(
      /pilot/i.test(db.database),
      "the database name says pilot",
      `expected a name containing "pilot", found ${db.database}`,
    );
  } else {
    advisory(true, `environment is ${env.APP_ENV}, so pilot database naming is not enforced`, db.database);
  }

  const alive = psqlValue(env, db.database, "select 1");
  mandatory(!alive.error && alive.value === "1", "the database answers", alive.error ?? "select 1 → 1");

  if (!alive.error) {
    const applied = psqlValue(
      env,
      db.database,
      "select count(*) from drizzle.__drizzle_migrations",
    );
    mandatory(!applied.error, "the migration table is present", applied.error ?? `${applied.value} applied`);

    // Pending migrations are the ones on disk that the database has not seen.
    const onDisk = existsSync(join(ROOT, "apps/api/drizzle"))
      ? (await import("node:fs")).readdirSync(join(ROOT, "apps/api/drizzle")).filter((f) => f.endsWith(".sql")).length
      : 0;
    const appliedCount = Number(applied.value ?? 0);
    mandatory(
      !applied.error && appliedCount >= onDisk,
      "migrations are current",
      `${appliedCount} applied, ${onDisk} on disk`,
    );

    const tables = psqlValue(
      env,
      db.database,
      "select count(*) from information_schema.tables where table_schema='public'",
    );
    advisory(Number(tables.value ?? 0) > 50, "the schema is populated", `${tables.value} tables`);
  }
}

/* --------------------------------------------------------------- secrets */

heading("Secrets");

const PLACEHOLDER = /^(dev|test|local)[-_]|change[-_ ]?me|^(secret|password|changeme|placeholder|example)$/i;
for (const name of ["JWT_ACCESS_SECRET"]) {
  const value = env[name] ?? "";
  const strong = value.length >= 32 && new Set(value).size >= 12 && !PLACEHOLDER.test(value);
  mandatory(strong, `${name} is a generated secret, not a placeholder`,
    value ? `${value.length} characters, ${new Set(value).size} distinct` : "not set");
}
if (env.JWT_REFRESH_SECRET) {
  const value = env.JWT_REFRESH_SECRET;
  mandatory(
    value.length >= 32 && !PLACEHOLDER.test(value),
    "JWT_REFRESH_SECRET is not a published placeholder",
    `${value.length} characters`,
  );
}
mandatory(
  (env.FFOS_ALLOW_DB_RESET ?? "").toLowerCase() !== "true",
  "destructive database resets are not enabled",
  `FFOS_ALLOW_DB_RESET=${env.FFOS_ALLOW_DB_RESET ?? "unset"}`,
);

/* -------------------------------------------------------- object storage */

heading("Object storage");

mandatory(Boolean(env.S3_ENDPOINT), "an object storage endpoint is configured", env.S3_ENDPOINT ?? "not set");
mandatory(Boolean(env.S3_BUCKET), "a bucket is configured", env.S3_BUCKET ?? "not set");

if (env.S3_ENDPOINT && env.S3_BUCKET) {
  const reachable = aws(env, ["s3api", "list-buckets"]);
  mandatory(reachable.status === 0, "object storage answers", reachable.status === 0 ? env.S3_ENDPOINT : "no response");

  const exists = bucketExists(env, env.S3_BUCKET);
  mandatory(exists, "the configured bucket exists", env.S3_BUCKET);

  if (env.FFOS_PILOT_BUCKET) {
    mandatory(
      env.S3_BUCKET === env.FFOS_PILOT_BUCKET,
      "the configured bucket is the expected pilot bucket",
      `configured ${env.S3_BUCKET}, expected ${env.FFOS_PILOT_BUCKET}`,
    );
  } else if (env.APP_ENV === "pilot") {
    mandatory(false, "FFOS_PILOT_BUCKET names the bucket the pilot expects", "not set");
  }

  if (exists) {
    const safety = bucketSafety(env, env.S3_BUCKET);
    mandatory(
      safety.versioningSafe,
      "bucket versioning is off",
      `versioning=${safety.versioning}` +
        (safety.versioningSafe
          ? ""
          : " — a versioned bucket keeps deleted objects readable, which breaks erasure"),
    );
    mandatory(safety.objectLockSafe, "object lock is off", `object lock=${safety.objectLock}`);
    advisory(
      safety.objectLock === "disabled",
      "no retention configuration is in force",
      "retention is only queryable where object lock is configured",
    );
  }
}

/* --------------------------------------------------------------- backups */

heading("Backups");

const root = backupRoot(env);
mandatory(Boolean(root), "a backup destination is configured", env.FFOS_BACKUP_DIR ?? "FFOS_BACKUP_DIR not set");

if (root) {
  const present = existsSync(root);
  mandatory(present, "the backup destination exists", root);
  if (present) {
    let writable = true;
    try {
      accessSync(root, constants.W_OK);
    } catch {
      writable = false;
    }
    mandatory(writable, "the backup destination is writable", root);

    const backups = listBackups(root).filter((b) => b.manifest?.status === "COMPLETE");
    const newest = backups[0];
    if (command === "check") {
      const ageHours = newest
        ? (Date.now() - Date.parse(newest.manifest.createdAt)) / 3_600_000
        : Infinity;
      mandatory(
        Boolean(newest) && ageHours <= 24,
        "a complete backup exists from the last 24 hours",
        newest ? `${newest.backupId}, ${ageHours.toFixed(1)}h old` : "no complete backup found",
      );
    } else {
      advisory(
        Boolean(newest),
        "a previous complete backup is on file",
        newest ? `${newest.backupId} (${newest.manifest.createdAt})` : "none yet — take one before entering real data",
      );
    }
  }
}

const ledger = tombstonePath(env);
mandatory(
  Boolean(ledger),
  "an erasure ledger location is configured",
  env.FFOS_ERASURE_LEDGER_DIR ?? "FFOS_ERASURE_LEDGER_DIR not set",
);
if (ledger) {
  const dir = join(ledger, "..");
  mandatory(existsSync(dir), "the erasure ledger directory exists", dir);
  if (root && existsSync(dir)) {
    advisory(
      !dir.startsWith(root),
      "the erasure ledger is not inside the backup directory",
      "restoring a backup must not be able to roll the ledger back",
    );
  }
}

/* --------------------------------------------------------------- runtime */

heading("Runtime");

async function head(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return response.status;
  } catch {
    return 0;
  }
}

const apiUrl = env.FFOS_API_URL ?? "http://localhost:3001";
const webUrl = env.FFOS_WEB_URL ?? "http://localhost:3000";
const apiStatus = await head(`${apiUrl}/health`);
mandatory(apiStatus === 200, "the API is healthy", `${apiUrl}/health → ${apiStatus || "no response"}`);
advisory((await head(webUrl)) === 200, "the web application answers", webUrl);

if (env.REDIS_URL) {
  const redisHost = (() => {
    try {
      return new URL(env.REDIS_URL).hostname;
    } catch {
      return null;
    }
  })();
  advisory(Boolean(redisHost), "Redis is configured", env.REDIS_URL?.replace(/\/\/.*@/, "//"));
}

if (command === "check" && db) {
  heading("Ledger integrity");
  const unbalanced = psqlValue(
    env,
    db.database,
    `select count(*) from (
       select le.id from ledger_entries le join ledger_postings lp on lp.ledger_entry_id = le.id
       group by le.id
       having sum(case when lp.side='debit' then lp.amount_minor else -lp.amount_minor end) <> 0
     ) x`,
  );
  mandatory(!unbalanced.error && unbalanced.value === "0", "every ledger entry balances", unbalanced.error ?? `unbalanced ${unbalanced.value}`);

  const currency = psqlValue(
    env,
    db.database,
    "select count(*) from ledger_postings lp join accounts a on a.id = lp.account_id where lp.currency <> a.currency",
  );
  mandatory(!currency.error && currency.value === "0", "no posting sits in the wrong currency", currency.error ?? `mismatched ${currency.value}`);

  const orphans = psqlValue(
    env,
    db.database,
    `select count(*) from ledger_postings lp
       where not exists (select 1 from households h where h.id = lp.household_id)`,
  );
  mandatory(!orphans.error && orphans.value === "0", "no posting belongs to a household that is gone", orphans.error ?? `orphans ${orphans.value}`);

  // A document row whose object is not in the store. Usually the aftermath of
  // an erasure that failed closed, which is the right behaviour but leaves work
  // for a person. Reported here rather than in recovery validation, because it
  // is a fact about the live system that a faithful restore will reproduce.
  if (env.S3_BUCKET) {
    const keys = psqlValue(
      env,
      db.database,
      "select coalesce(string_agg(storage_key, '|'), '') from documents where storage_key is not null and storage_key <> ''",
    );
    const wanted = (keys.value ?? "").split("|").filter(Boolean);
    const listed = aws(env, ["s3", "ls", `s3://${env.S3_BUCKET}`, "--recursive"]);
    const present = new Set(
      (listed.stdout || "")
        .split("\n")
        .filter(Boolean)
        .map((row) => row.split(/\s+/).slice(3).join(" ")),
    );
    const dangling = wanted.filter((key) => !present.has(key));
    advisory(
      dangling.length === 0,
      "every document row resolves to an object in the bucket",
      dangling.length === 0
        ? `${wanted.length} documents`
        : `${dangling.length} of ${wanted.length} have no object — see the erasure STOP condition in the runbook`,
    );
  }

  const failedErasures = psqlValue(
    env,
    db.database,
    "select count(*) from privacy_requests where status = 'failed'",
  );
  advisory(
    !failedErasures.error && failedErasures.value === "0",
    "no erasure is sitting in a failed state",
    failedErasures.error ?? `failed ${failedErasures.value}` +
      (failedErasures.value !== "0" ? " — see the runbook before retrying" : ""),
  );
}

/* --------------------------------------------------------------- verdict */

const failures = results.filter((r) => r.weight === "mandatory" && !r.passed);
const advisories = results.filter((r) => r.weight === "advisory" && !r.passed);

heading("Result");
line("Mandatory checks", `${results.filter((r) => r.weight === "mandatory").length}`);
line("Failed", `${failures.length}`);
line("Advisories", `${advisories.length}`);

if (failures.length > 0) {
  console.log("");
  for (const failure of failures) bad(failure.text, failure.detail);
  die(
    command === "check"
      ? "The pilot is not in a safe state. Follow docs/pilot/PILOT_RUNBOOK.md before entering more data."
      : "Preflight failed. The pilot may not start until every mandatory check passes.",
  );
}

console.log(
  command === "check"
    ? "\n✓ Pilot check passed.\n"
    : "\n✓ Preflight passed. The system may accept pilot data once the start checklist is signed off.\n",
);
