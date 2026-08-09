#!/usr/bin/env node
/**
 * Operational drills.
 *
 *   node scripts/ops/drill.mjs recovery    backup → mutate → restore → compare
 *   node scripts/ops/drill.mjs privacy     backup → erase → restore → stays erased
 *   node scripts/ops/drill.mjs negative    the failures that must be refused
 *
 * Backup tooling that has never been restored is a belief, not a capability.
 * These drills build pilot-like data through the product's own API, take a real
 * backup, break something on purpose, and then prove the recovery copy is
 * right down to the öre and the byte.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import {
  aws,
  backupRoot,
  bad,
  die,
  heading,
  line,
  listBackups,
  loadContext,
  note,
  ok,
  psqlValue,
  ROOT,
  sha256String,
} from "./lib.mjs";

const which = process.argv[2] ?? "recovery";
const env = loadContext();
const API = env.FFOS_API_URL ? `${env.FFOS_API_URL}/api/v1` : "http://localhost:3001/api/v1";
const MARKER = "personnummer 19900101-1234";
const root = backupRoot(env);
if (!root) die("FFOS_BACKUP_DIR is not configured.");

const results = [];
function check(id, claim, passed, detail = "") {
  results.push({ id, passed });
  if (passed) ok(`${id} ${claim}`, detail);
  else bad(`${id} ${claim}`, detail);
}

/* ------------------------------------------------------------------ helpers */

async function call(method, path, { token, body, query } = {}) {
  const url = new URL(API + path);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 256,
    ...options,
    env: { ...process.env, ...(options.env ?? {}) },
  });
}

function ops(script, args, extraEnv = {}) {
  return run("node", [`scripts/ops/${script}`, ...args], { env: extraEnv });
}

const live = (sql) => psqlValue(env, dbName(), sql);
const recovery = (sql) => psqlValue(env, env.FFOS_RECOVERY_DATABASE ?? `${dbName()}_recovery`, sql);

function dbName() {
  try {
    return decodeURIComponent(new URL(env.DATABASE_URL).pathname.replace(/^\//, ""));
  } catch {
    return "ffos_dev";
  }
}

async function register(prefix) {
  const email = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const { body } = await call("POST", "/auth/register", {
    body: { email, password: "PilotDrill123!", displayName: prefix },
  });
  return { token: body.tokens.accessToken, email };
}

/**
 * A household shaped like the first pilot: SEK, a handful of accounts, real
 * events, a vehicle and an uploaded document.
 */
async function buildHousehold(name, { document = true } = {}) {
  const { token } = await register("drill");
  const { body: household } = await call("POST", "/households", { token, body: { name } });
  const householdId = household.id;

  const account = async (accountName, accountType, opening) =>
    (
      await call("POST", "/accounts", {
        token,
        body: { householdId, name: accountName, accountType, currency: "SEK", openingBalanceMinor: opening },
      })
    ).body.id;

  const cash = await account("Lönekonto", "CHECKING", "4200000");
  await account("Sparkonto", "SAVINGS", "1500000");

  await call("POST", "/ledger/income", {
    token,
    body: { householdId, cashAccountId: cash, amountMinor: "3850000", occurredOn: "2026-08-01", description: "Lön" },
  });
  await call("POST", "/ledger/expenses", {
    token,
    body: { householdId, cashAccountId: cash, amountMinor: "1245000", occurredOn: "2026-08-03", description: "Hyra" },
  });
  await call("POST", "/ledger/expenses", {
    token,
    body: { householdId, cashAccountId: cash, amountMinor: "387550", occurredOn: "2026-08-05", description: "Mat" },
  });

  await call("POST", "/vehicles", {
    token,
    body: {
      householdId,
      name: "Familjebilen",
      make: "Volvo",
      model: "V60",
      modelYear: 2020,
      fuelType: "DIESEL",
      acquisitionMode: "EXISTING",
      purchaseType: "CASH",
      purchaseDate: "2022-04-01",
      purchasePriceMinor: "22000000",
      currentValueMinor: "16000000",
    },
  });

  let documentBytes = null;
  if (document) {
    documentBytes = Buffer.from(`${MARKER}\nKvitto ${name}\n`);
    await call("POST", "/documents/upload", {
      token,
      body: {
        householdId,
        title: "Kvitto",
        filename: "kvitto.txt",
        contentType: "text/plain",
        contentBase64: documentBytes.toString("base64"),
      },
    });
  }

  const row = live(
    `select coalesce(max(storage_key),'') || '|' || coalesce(max(bucket),'') from documents where household_id = '${householdId}'`,
  ).value;
  const [storageKey, bucket] = (row ?? "|").split("|");

  return { token, householdId, cash, storageKey, bucket, documentBytes };
}

/** Net worth from the ledger, in minor units, computed independently of the product. */
function derivedNetWorth(query, householdId) {
  const value = query(
    `select
       (select coalesce(sum(a.opening_balance_minor),0) from accounts a
          where a.household_id = '${householdId}' and a.is_system is not true)
     + (select coalesce(sum(case when lp.side='credit' then lp.amount_minor else -lp.amount_minor end),0)
          from ledger_postings lp join accounts a2 on a2.id = lp.account_id
         where lp.household_id = '${householdId}' and a2.account_type = 'INCOME')
     - (select coalesce(sum(case when lp.side='debit' then lp.amount_minor else -lp.amount_minor end),0)
          from ledger_postings lp join accounts a3 on a3.id = lp.account_id
         where lp.household_id = '${householdId}' and a3.account_type = 'EXPENSE')`,
  );
  return value.error ? null : value.value;
}

function latestCompleteBackup() {
  return listBackups(root).find((b) => b.manifest?.status === "COMPLETE") ?? null;
}

/* ------------------------------------------------------- drill: recovery */

async function recoveryDrill() {
  heading("Recovery drill — backup, break, restore, compare");

  const household = await buildHousehold("Drill hushåll");
  check("DR-01", "pilot-like household built through the product", Boolean(household.householdId),
    `household ${household.householdId.slice(0, 8)}…, document ${household.storageKey ? "uploaded" : "missing"}`);

  const expected = {
    netWorth: derivedNetWorth(live, household.householdId),
    accounts: live(`select count(*) from accounts where household_id='${household.householdId}' and is_system is not true`).value,
    events: live(`select count(*) from financial_events where household_id='${household.householdId}'`).value,
    postings: live(`select count(*) from ledger_postings where household_id='${household.householdId}'`).value,
    vehicles: live(`select count(*) from vehicles where household_id='${household.householdId}'`).value,
    documents: live(`select count(*) from documents where household_id='${household.householdId}'`).value,
    documentSha: createHash("sha256").update(household.documentBytes).digest("hex"),
  };
  line("Expected net worth", `${expected.netWorth} öre`);
  line("Expected rows", `${expected.accounts} accounts, ${expected.events} events, ${expected.postings} postings`);

  heading("Backup");
  const backup = ops("backup.mjs", ["pilot"]);
  check("DR-02", "the backup completed", backup.status === 0 && /BACKUP COMPLETE/.test(backup.stdout),
    (backup.stdout.match(/BACKUP COMPLETE — (\S+)/) ?? [])[1] ?? backup.stderr.trim().split("\n").pop());
  const taken = latestCompleteBackup();
  if (!taken) return die("the drill has no backup to restore");

  // Data loss, not erasure. The two are different events and must not be
  // confused: an erasure is meant to survive a restore, whereas loss is exactly
  // what a restore is for. So the document goes the way an accident takes it —
  // row and object together, leaving no tombstone — rather than through the
  // privacy flow, which the separate privacy drill covers.
  heading("Losing live state on purpose");
  await call("POST", "/ledger/expenses", {
    token: household.token,
    body: {
      householdId: household.householdId,
      cashAccountId: household.cash,
      amountMinor: "999900",
      occurredOn: "2026-08-06",
      description: "Efter backup",
    },
  });
  const objectGone = spawnSync("docker", [
    "exec", "ekonomi-minio-1", "sh", "-lc", `rm -rf "/data/${household.bucket}/${household.storageKey}"`,
  ]);
  live(`delete from documents where household_id = '${household.householdId}'`);
  const afterMutation = derivedNetWorth(live, household.householdId);
  check("DR-03", "the live copy now differs from the backup",
    afterMutation !== expected.netWorth && objectGone.status === 0,
    `net worth ${expected.netWorth} → ${afterMutation}, document and object lost`);

  heading("Restoring into the recovery environment");
  const prepared = ops("recovery.mjs", ["prepare", taken.backupId]);
  check("DR-04", "recovery prepared and validated", prepared.status === 0 && /RECOVERY PREPARED/.test(prepared.stdout),
    prepared.status === 0 ? taken.backupId : (prepared.stdout + prepared.stderr).trim().split("\n").slice(-2).join(" "));
  if (prepared.status !== 0) return;

  heading("Comparing the recovery copy with what was recorded");
  const restoredNetWorth = derivedNetWorth(recovery, household.householdId);
  check("DR-05", "net worth matches to the öre, not approximately",
    restoredNetWorth === expected.netWorth, `expected ${expected.netWorth}, restored ${restoredNetWorth}`);

  for (const [label, sql] of [
    ["accounts", `select count(*) from accounts where household_id='${household.householdId}' and is_system is not true`],
    ["events", `select count(*) from financial_events where household_id='${household.householdId}'`],
    ["postings", `select count(*) from ledger_postings where household_id='${household.householdId}'`],
    ["vehicles", `select count(*) from vehicles where household_id='${household.householdId}'`],
    ["documents", `select count(*) from documents where household_id='${household.householdId}'`],
  ]) {
    const restored = recovery(sql).value;
    check(`DR-06:${label}`, `${label} restored exactly`, restored === expected[label],
      `expected ${expected[label]}, restored ${restored}`);
  }

  check("DR-07", "the transaction made after the backup is absent from the recovery copy",
    restoredNetWorth === expected.netWorth,
    "the recovery copy is the world as it was when the backup was taken");

  heading("Comparing the bytes");
  const recoveryBucket = env.FFOS_RECOVERY_BUCKET ?? `${env.S3_BUCKET}-recovery`;
  const target = join("/tmp", `drill-restored-${Date.now()}.bin`);
  const fetched = aws(env, ["s3", "cp", `s3://${recoveryBucket}/${household.storageKey}`, target, "--only-show-errors"]);
  const restoredSha = fetched.status === 0 && existsSync(target)
    ? createHash("sha256").update(readFileSync(target)).digest("hex")
    : null;
  check("DR-08", "the restored document is byte-identical to the original",
    restoredSha === expected.documentSha,
    restoredSha ? `sha256 ${restoredSha.slice(0, 16)}… vs ${expected.documentSha.slice(0, 16)}…` : "object not retrievable");
  check("DR-09", "the restored document still contains what was uploaded",
    restoredSha === expected.documentSha && readFileSync(target, "utf8").includes(MARKER),
    "marker present in the restored bytes");

  // Remove the drill's own household so repeated drills do not accumulate, and
  // do it without the privacy flow: a tombstone here would tell every future
  // recovery to delete this household, which is not what a drill should assert
  // about the world.
  heading("Cleaning up the drill household");
  live(`delete from source_transaction_links where household_id = '${household.householdId}'`);
  live(`delete from households where id = '${household.householdId}'`);
  const leftovers = live(
    `select count(*) from documents where household_id = '${household.householdId}'`,
  ).value;
  check("DR-10", "the drill leaves the live system consistent", leftovers === "0",
    "drill household removed, no orphan rows left behind");
}

/* -------------------------------------------------------- drill: privacy */

async function privacyDrill() {
  heading("Privacy drill — a restore must not undo an erasure");

  const household = await buildHousehold("Drill radering");
  check("PR-01", "household with a marked document built", Boolean(household.storageKey),
    `household ${household.householdId.slice(0, 8)}…`);

  heading("Backup taken before the erasure");
  const backup = ops("backup.mjs", ["pilot"]);
  check("PR-02", "the pre-erasure backup completed", backup.status === 0 && /BACKUP COMPLETE/.test(backup.stdout));
  const taken = latestCompleteBackup();
  if (!taken) return die("no backup to restore");
  const inBackup = existsSync(join(taken.path, "objects", household.storageKey));
  check("PR-03", "the backup really contains the object that is about to be erased", inBackup,
    `objects/${household.storageKey.slice(-28)}`);

  heading("Erasing the household");
  const { body: request } = await call("POST", "/privacy/delete-request", {
    token: household.token,
    body: { householdId: household.householdId, kind: "delete_household", note: "drill" },
  });
  const confirmed = await call("POST", `/privacy/requests/${request.id}/confirm`, {
    token: household.token,
    body: { householdName: "Drill radering" },
  });
  check("PR-04", "the erasure completed", confirmed.body?.status === "completed",
    `status ${confirmed.body?.status}, objectsRemoved ${confirmed.body?.objectsRemoved}`);

  const stillLive = spawnSync("docker", [
    "exec", "ekonomi-minio-1", "sh", "-lc",
    `test -e "/data/${household.bucket}/${household.storageKey}" && echo present || echo gone`,
  ]).stdout.toString().trim();
  check("PR-05", "the live object is gone", stillLive === "gone", `live object ${stillLive}`);

  const ledgerFile = join(ROOT, env.FFOS_ERASURE_LEDGER_DIR ?? "var/erasure-ledger", "erasures.jsonl");
  const recorded = existsSync(ledgerFile)
    && readFileSync(ledgerFile, "utf8").includes(household.householdId);
  check("PR-06", "the erasure is recorded in the durable ledger outside the database", recorded,
    ledgerFile);

  heading("Restoring the pre-erasure backup");
  const prepared = ops("recovery.mjs", ["prepare", taken.backupId]);
  check("PR-07", "recovery prepared", prepared.status === 0 && /RECOVERY PREPARED/.test(prepared.stdout),
    prepared.status === 0 ? taken.backupId : (prepared.stdout + prepared.stderr).trim().split("\n").slice(-2).join(" "));
  if (prepared.status !== 0) return;

  heading("The erased household must not be back");
  const households = recovery(`select count(*) from households where id = '${household.householdId}'`).value;
  check("PR-08", "the erased household is not in the recovery copy", households === "0",
    `households matching the erased id: ${households}`);

  const documents = recovery(`select count(*) from documents where household_id = '${household.householdId}'`).value;
  check("PR-09", "no document row for the erased household survived the replay", documents === "0",
    `documents: ${documents}`);

  const recoveryBucket = env.FFOS_RECOVERY_BUCKET ?? `${env.S3_BUCKET}-recovery`;
  const listed = aws(env, ["s3", "ls", `s3://${recoveryBucket}/${household.storageKey}`]);
  const objectBack = listed.status === 0 && (listed.stdout || "").trim().length > 0;
  check("PR-10", "the erased object is not in the recovery bucket either", !objectBack,
    objectBack ? "the object came back" : "absent after replay");

  const postings = recovery(`select count(*) from ledger_postings where household_id = '${household.householdId}'`).value;
  check("PR-11", "no financial row for the erased household survived", postings === "0", `postings: ${postings}`);
}

/* ------------------------------------------------------- drill: negative */

async function negativeDrill() {
  heading("Negative drill — the failures that must be refused");

  const base = {
    FFOS_BACKUP_DIR: env.FFOS_BACKUP_DIR ?? "./var/backups",
    FFOS_ERASURE_LEDGER_DIR: env.FFOS_ERASURE_LEDGER_DIR ?? "./var/erasure-ledger",
    FFOS_RECOVERY_DATABASE: env.FFOS_RECOVERY_DATABASE ?? "ffos_dev_recovery",
    FFOS_RECOVERY_BUCKET: env.FFOS_RECOVERY_BUCKET ?? "ffos-recovery",
  };
  const preflight = (overrides) => ops("pilot.mjs", ["preflight"], { ...base, ...overrides });

  const cases = [
    ["NG-01", "a pilot pointed at a development database", {
      APP_ENV: "pilot", DATABASE_URL: env.DATABASE_URL, FFOS_PILOT_BUCKET: env.S3_BUCKET,
    }],
    ["NG-02", "a database that does not answer", {
      DATABASE_URL: "postgresql://ffos:ffos@localhost:5999/ffos_pilot",
    }],
    ["NG-03", "a bucket that does not exist", { S3_BUCKET: "bucket-som-inte-finns" }],
    ["NG-04", "a bucket that is not the expected pilot bucket", {
      FFOS_PILOT_BUCKET: "ffos-pilot", S3_BUCKET: env.S3_BUCKET,
    }],
    ["NG-05", "a placeholder signing secret", { JWT_ACCESS_SECRET: "dev-access-secret-change-me" }],
    ["NG-06", "a missing backup destination", { FFOS_BACKUP_DIR: "./var/does-not-exist" }],
    ["NG-07", "destructive resets left enabled", { FFOS_ALLOW_DB_RESET: "true" }],
    ["NG-08", "no erasure ledger configured", { FFOS_ERASURE_LEDGER_DIR: "" }],
  ];
  for (const [id, claim, overrides] of cases) {
    const done = preflight(overrides);
    check(id, `preflight blocks ${claim}`, done.status !== 0,
      done.status === 0 ? "preflight passed when it should have failed" : "exit non-zero");
  }

  // The precondition the whole erasure architecture rests on. A versioned
  // bucket keeps deleted objects readable, so a pilot must never run on one.
  heading("Bucket safety preconditions");
  const versioned = "ffos-versioning-check";
  aws(env, ["s3api", "create-bucket", "--bucket", versioned]);
  aws(env, ["s3api", "put-bucket-versioning", "--bucket", versioned,
    "--versioning-configuration", "Status=Enabled"]);
  const withVersioning = preflight({ S3_BUCKET: versioned, FFOS_PILOT_BUCKET: versioned });
  check("NG-17", "preflight blocks a bucket with versioning enabled",
    withVersioning.status !== 0 && /versioning/i.test(withVersioning.stdout),
    "a versioned bucket keeps deleted objects readable");
  const refusedBackup = ops("backup.mjs", ["objects"], { ...base, S3_BUCKET: versioned });
  check("NG-18", "a backup refuses to run against a versioned bucket",
    refusedBackup.status !== 0 && /versioning/i.test(refusedBackup.stdout + refusedBackup.stderr),
    "versioning is not the backup strategy");
  aws(env, ["s3api", "put-bucket-versioning", "--bucket", versioned,
    "--versioning-configuration", "Status=Suspended"]);
  aws(env, ["s3api", "delete-bucket", "--bucket", versioned]);

  const locked = "ffos-objectlock-check";
  const madeLocked = aws(env, ["s3api", "create-bucket", "--bucket", locked,
    "--object-lock-enabled-for-bucket"]);
  if (madeLocked.status === 0) {
    const withLock = preflight({ S3_BUCKET: locked, FFOS_PILOT_BUCKET: locked });
    check("NG-19", "preflight blocks a bucket with object lock enabled", withLock.status !== 0,
      "object lock prevents the deletion an erasure depends on");
    aws(env, ["s3api", "put-bucket-versioning", "--bucket", locked,
      "--versioning-configuration", "Status=Suspended"]);
    aws(env, ["s3api", "delete-bucket", "--bucket", locked]);
  } else {
    note("NG-19 skipped: this object store would not create an object-lock bucket");
  }

  heading("Backup failures");
  const pgFail = ops("backup.mjs", ["postgres"], { ...base, FFOS_PG_CONTAINER: "container-som-inte-finns" });
  check("NG-09", "a failed database dump fails the backup", pgFail.status !== 0 && /BACKUP FAILED/.test(pgFail.stdout + pgFail.stderr));
  const objFail = ops("backup.mjs", ["objects"], { ...base, S3_ENDPOINT: "http://127.0.0.1:9" });
  check("NG-10", "a failed object copy fails the backup", objFail.status !== 0 && /BACKUP FAILED/.test(objFail.stdout + objFail.stderr));

  const failedManifests = listBackups(root).filter((b) => b.manifest?.status === "FAILED");
  check("NG-11", "a partial backup is never marked COMPLETE", failedManifests.length >= 2,
    `${failedManifests.length} manifests marked FAILED`);
  const chosen = ops("recovery.mjs", ["prepare", "latest"], base);
  check("NG-12", "\"latest\" never selects a failed backup",
    !/FAILED/.test((chosen.stdout.match(/Backup status\s+(\S+)/) ?? [])[1] ?? ""),
    `selected status ${(chosen.stdout.match(/Backup status\s+(\S+)/) ?? [])[1] ?? "?"}`);

  heading("Corrupted and mismatched artefacts");
  const good = latestCompleteBackup();
  if (good) {
    const dumpPath = join(good.path, good.manifest.database.file);
    const original = readFileSync(dumpPath);
    const corrupted = Buffer.from(original);
    corrupted[Math.floor(corrupted.length / 2)] ^= 0xff;
    writeFileSync(dumpPath, corrupted);
    const rejected = ops("recovery.mjs", ["prepare", good.backupId], base);
    check("NG-13", "a corrupted dump is rejected before any restore is attempted",
      rejected.status !== 0 && /does not match its recorded checksum/.test(rejected.stdout + rejected.stderr),
      "checksum mismatch refused");
    writeFileSync(dumpPath, original);

    const others = listBackups(root).filter((b) => b.manifest?.status === "COMPLETE" && b.backupId !== good.backupId);
    if (others[0]) {
      const listingPath = join(good.path, good.manifest.objects.listing);
      const keep = readFileSync(listingPath);
      copyFileSync(join(others[0].path, others[0].manifest.objects.listing), listingPath);
      const mismatched = ops("recovery.mjs", ["prepare", good.backupId], base);
      check("NG-14", "object artefacts from another backup are detected",
        mismatched.status !== 0, "manifest validation refused the mismatched pair");
      writeFileSync(listingPath, keep);
    } else {
      note("NG-14 skipped: only one complete backup available to mismatch against");
    }

    heading("Restore-to-live guard");
    const toLive = ops("recovery.mjs", ["prepare", good.backupId], {
      ...base, FFOS_RECOVERY_DATABASE: dbName(),
    });
    check("NG-15", "a restore refuses to target the live database", toLive.status !== 0,
      "recovery database equal to the live database is refused");
    const toLiveBucket = ops("recovery.mjs", ["prepare", good.backupId], {
      ...base, FFOS_RECOVERY_BUCKET: env.S3_BUCKET,
    });
    check("NG-16", "a restore refuses to target the live bucket", toLiveBucket.status !== 0,
      "recovery bucket equal to the live bucket is refused");
  }

  // The deliberately broken backups have served their purpose; leaving them in
  // the destination would clutter every later listing.
  heading("Clearing the deliberately failed backups");
  let cleared = 0;
  for (const candidate of listBackups(root)) {
    if (candidate.manifest?.status === "FAILED") {
      rmSync(candidate.path, { recursive: true, force: true });
      cleared += 1;
    }
  }
  note(`${cleared} failed backups removed`);
}

/* ------------------------------------------------------------------- main */

if (which === "recovery") await recoveryDrill();
else if (which === "privacy") await privacyDrill();
else if (which === "negative") await negativeDrill();
else die(`Unknown drill "${which}". Use recovery, privacy or negative.`);

const passed = results.filter((r) => r.passed).length;
console.log(`\nTOTAL ${results.length}  PASS ${passed}  FAIL ${results.length - passed}\n`);
process.exit(passed === results.length ? 0 : 1);
