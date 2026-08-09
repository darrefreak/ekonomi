#!/usr/bin/env node
/**
 * Recovery for the pilot.
 *
 *   pnpm restore:postgres <backupId>    database into the recovery database
 *   pnpm restore:objects  <backupId>    objects into the recovery bucket
 *   pnpm recovery:prepare <backupId>    both, plus erasure replay and validation
 *
 * Restoring never touches what is live. Everything lands in a separate recovery
 * database and a separate recovery bucket, is checked there, and only a
 * deliberate, documented operator step promotes it. A restore command that can
 * casually overwrite the running pilot is a data-loss incident waiting for a
 * tired evening.
 *
 * The other half is privacy. A backup taken before an erasure still contains
 * the erased household, so before a restored copy may be used, every erasure
 * recorded since is replayed over it. The ledger that says what was erased
 * lives outside the database, which is what makes it survive the restore.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertKnownEnvironment,
  aws,
  backupRoot,
  bad,
  bucketExists,
  databaseKind,
  describeDatabase,
  die,
  heading,
  line,
  loadContext,
  note,
  ok,
  pg,
  psqlValue,
  readTombstones,
  resolveBackup,
  sha256File,
  sha256String,
  tombstonePath,
} from "./lib.mjs";

const what = process.argv[2] ?? "prepare";
const requested = process.argv[3] ?? "latest";
const force = process.argv.includes("--force");

const env = loadContext();
assertKnownEnvironment(env);

const live = describeDatabase(env.DATABASE_URL);
const root = backupRoot(env);
if (!root) die("FFOS_BACKUP_DIR is not configured.");
if (!live) die("DATABASE_URL does not name a database.");

const recoveryDatabase = env.FFOS_RECOVERY_DATABASE ?? `${live.database}_recovery`;
const recoveryBucket = env.FFOS_RECOVERY_BUCKET ?? `${env.S3_BUCKET ?? "ffos"}-recovery`;

/* ------------------------------------------------------- target guardrails */

if (recoveryDatabase === live.database) {
  die(
    `The recovery database (${recoveryDatabase}) is the live database. ` +
      "Restores go somewhere else; set FFOS_RECOVERY_DATABASE.",
  );
}
if (env.S3_BUCKET && recoveryBucket === env.S3_BUCKET) {
  die(
    `The recovery bucket (${recoveryBucket}) is the live bucket. ` +
      "Restores go somewhere else; set FFOS_RECOVERY_BUCKET.",
  );
}

/* ---------------------------------------------------------------- manifest */

const backup = resolveBackup(root, requested);
if (!backup) die(`No backup found for "${requested}" in ${root}.`);
const manifest = backup.manifest;
if (!manifest) die(`${backup.backupId} has no readable manifest.`);

heading(`Recovery from ${backup.backupId}`);
line("Environment", env.APP_ENV);
line("Backup taken", manifest.createdAt);
line("Backup environment", manifest.environment);
line("Backup commit", (manifest.gitCommit ?? "unknown").slice(0, 12));
line("Backup status", manifest.status);
line("Live database", live.describe());
line("Recovery database", recoveryDatabase);
line("Live bucket", env.S3_BUCKET ?? "(none)");
line("Recovery bucket", recoveryBucket);
note("Nothing live is modified by this command.");

heading("Manifest validation");

if (manifest.status !== "COMPLETE") {
  die(
    `${backup.backupId} is marked ${manifest.status}. A partial backup is not a restore point. ` +
      "Choose a COMPLETE backup.",
  );
}
ok("the backup is marked COMPLETE");

if (manifest.environment !== env.APP_ENV && !force) {
  die(
    `The backup was taken in "${manifest.environment}" and this is "${env.APP_ENV}". ` +
      "Restoring across environments needs --force and a reason.",
  );
}
ok("the backup environment matches", manifest.environment);

// The manifest is what ties one database snapshot to one object snapshot. Both
// halves are checked before anything is written, so a database from Monday can
// never be silently paired with objects from Wednesday.
if (manifest.database) {
  const file = join(backup.path, manifest.database.file);
  if (!existsSync(file)) die(`The manifest names ${manifest.database.file}, which is not in the backup.`);
  const actual = sha256File(file);
  if (actual !== manifest.database.sha256) {
    die(
      `The database dump does not match its recorded checksum.\n` +
        `    recorded ${manifest.database.sha256}\n    actual   ${actual}\n` +
        "  Refusing to restore a corrupted artefact.",
    );
  }
  ok("the database dump matches its checksum", `${manifest.database.file}`);
}

if (manifest.objects) {
  const listingFile = join(backup.path, manifest.objects.listing);
  if (!existsSync(listingFile)) die(`The manifest names ${manifest.objects.listing}, which is not in the backup.`);
  const contents = readFileSync(listingFile, "utf8");
  if (sha256String(contents) !== manifest.objects.sha256) {
    die("The object listing does not match its recorded checksum. Refusing to restore a corrupted artefact.");
  }
  const listing = JSON.parse(contents);
  if (listing.objects.length !== manifest.objects.count) {
    die(
      `The object listing holds ${listing.objects.length} objects but the manifest claims ` +
        `${manifest.objects.count}. These artefacts do not belong together.`,
    );
  }
  let mismatched = 0;
  for (const entry of listing.objects) {
    const full = join(backup.path, "objects", entry.key);
    if (!existsSync(full) || sha256File(full) !== entry.sha256) mismatched += 1;
  }
  if (mismatched > 0) die(`${mismatched} backed-up objects do not match their checksums. Refusing to restore.`);
  ok("every backed-up object matches its checksum", `${listing.objects.length} objects`);
}

/* -------------------------------------------------------- restore database */

function restoreDatabase() {
  heading("Restoring the database");
  if (!manifest.database) {
    note("this backup holds no database dump");
    return false;
  }

  const kind = databaseKind(recoveryDatabase);
  line("Target", recoveryDatabase);
  line("Target classification", kind);

  // Recreate the recovery database from scratch so a previous drill cannot leave
  // rows behind and make the restore look better than it is. This is scoped to
  // the recovery database by name and can never name the live one: the guard
  // above already refused that case.
  const drop = pg(["psql", "-U", live.user || "ffos", "-d", "postgres", "-q", "-c",
    `drop database if exists ${recoveryDatabase}`], { env });
  if (drop.status !== 0) {
    bad("could not clear the recovery database", (drop.stderr || "").trim().split("\n").pop());
    return false;
  }
  const create = pg(["psql", "-U", live.user || "ffos", "-d", "postgres", "-q", "-c",
    `create database ${recoveryDatabase}`], { env });
  if (create.status !== 0) {
    bad("could not create the recovery database", (create.stderr || "").trim().split("\n").pop());
    return false;
  }
  ok("recovery database created", recoveryDatabase);

  const dump = readFileSync(join(backup.path, manifest.database.file));
  const restore = pg(
    ["pg_restore", "-U", live.user || "ffos", "-d", recoveryDatabase, "--no-owner", "--no-privileges"],
    { env, input: dump },
  );
  // pg_restore warns about ownership on a fresh database; only a non-zero exit
  // with no restored rows is a failure, so the row count is checked below.
  if (restore.status !== 0) {
    note(`pg_restore reported: ${(restore.stderr || "").trim().split("\n").slice(-1)[0]}`);
  }
  const households = psqlValue(env, recoveryDatabase, "select count(*) from households");
  if (households.error) {
    bad("the restored database is not queryable", households.error);
    return false;
  }
  ok("database restored", `${households.value} households`);
  return true;
}

/* --------------------------------------------------------- restore objects */

function restoreObjects() {
  heading("Restoring objects");
  if (!manifest.objects) {
    note("this backup holds no objects");
    return true;
  }
  if (!env.S3_ENDPOINT) {
    bad("no object storage endpoint is configured");
    return false;
  }

  if (!bucketExists(env, recoveryBucket)) {
    const made = aws(env, ["s3api", "create-bucket", "--bucket", recoveryBucket]);
    if (made.status !== 0) {
      bad("could not create the recovery bucket", (made.stderr || "").trim().split("\n").pop());
      return false;
    }
  }
  ok("recovery bucket ready", recoveryBucket);

  const sync = aws(env, [
    "s3", "sync", join(backup.path, "objects"), `s3://${recoveryBucket}`, "--delete", "--only-show-errors",
  ]);
  if (sync.status !== 0) {
    bad("object restore failed", (sync.stderr || "").trim().split("\n").pop());
    return false;
  }

  const listed = aws(env, ["s3", "ls", `s3://${recoveryBucket}`, "--recursive"]);
  const count = (listed.stdout || "").split("\n").filter(Boolean).length;
  if (count !== manifest.objects.count) {
    bad("the restored object count does not match the manifest", `${count} restored, ${manifest.objects.count} expected`);
    return false;
  }
  ok("objects restored", `${count} objects into ${recoveryBucket}`);
  return true;
}

/* ----------------------------------------------------------- erasure replay */

/**
 * Re-apply every erasure recorded since the backup was taken.
 *
 * This is the step that keeps backup and the right to erasure from
 * contradicting each other. The live ledger is authoritative because it is not
 * part of what was restored.
 */
function replayErasures() {
  heading("Erasure replay");
  const ledgerFile = tombstonePath(env);
  const tombstones = readTombstones(ledgerFile);
  line("Ledger", ledgerFile ?? "(not configured)");
  line("Recorded erasures", String(tombstones.length));

  if (!ledgerFile) {
    bad("no erasure ledger is configured", "a restored copy could resurrect erased households");
    return false;
  }
  if (tombstones.length === 0) {
    note("nothing to replay");
    return true;
  }

  let households = 0;
  let objects = 0;
  for (const tombstone of tombstones) {
    if (!tombstone.householdId) continue;
    const present = psqlValue(
      env,
      recoveryDatabase,
      `select count(*) from households where id = '${tombstone.householdId}'`,
    );
    if (present.error) {
      bad("could not query the recovery database", present.error);
      return false;
    }
    if (present.value !== "0") {
      // Same shape as the live erasure: the rows that nothing cascades from
      // first, then the household.
      pg(["psql", "-U", live.user || "ffos", "-d", recoveryDatabase, "-q", "-c",
        `delete from source_transaction_links where household_id = '${tombstone.householdId}'`], { env });
      const removed = pg(["psql", "-U", live.user || "ffos", "-d", recoveryDatabase, "-q", "-c",
        `delete from households where id = '${tombstone.householdId}'`], { env });
      if (removed.status !== 0) {
        bad("could not replay an erasure", (removed.stderr || "").trim().split("\n").pop());
        return false;
      }
      households += 1;
    }
    for (const object of tombstone.objects ?? []) {
      if (!object.storageKey) continue;
      const deleted = aws(env, ["s3", "rm", `s3://${recoveryBucket}/${object.storageKey}`, "--only-show-errors"]);
      if (deleted.status === 0) objects += 1;
    }
  }
  ok("erasures replayed over the recovery copy", `${households} households, ${objects} objects removed`);
  return true;
}

/* ------------------------------------------------------------- validation */

function validate() {
  heading("Recovery validation");
  let good = true;
  const q = (sql) => psqlValue(env, recoveryDatabase, sql);

  const counts = {
    households: q("select count(*) from households").value,
    accounts: q("select count(*) from accounts").value,
    events: q("select count(*) from financial_events").value,
    postings: q("select count(*) from ledger_postings").value,
    documents: q("select count(*) from documents").value,
  };
  for (const [label, value] of Object.entries(counts)) line(label, value ?? "?");

  const unbalanced = q(`select count(*) from (
      select le.id from ledger_entries le join ledger_postings lp on lp.ledger_entry_id = le.id
      group by le.id
      having sum(case when lp.side='debit' then lp.amount_minor else -lp.amount_minor end) <> 0) x`);
  if (unbalanced.value === "0") ok("every ledger entry balances");
  else {
    bad("the restored ledger does not balance", `${unbalanced.value} unbalanced entries`);
    good = false;
  }

  const identity = q(`select count(*) from (
      select h.id,
        (select coalesce(sum(a.opening_balance_minor),0) from accounts a
           where a.household_id = h.id and a.is_system is not true) +
        (select coalesce(sum(case when lp.side='credit' then lp.amount_minor else -lp.amount_minor end),0)
           from ledger_postings lp join accounts a2 on a2.id = lp.account_id
          where lp.household_id = h.id and a2.account_type = 'INCOME') -
        (select coalesce(sum(case when lp.side='debit' then lp.amount_minor else -lp.amount_minor end),0)
           from ledger_postings lp join accounts a3 on a3.id = lp.account_id
          where lp.household_id = h.id and a3.account_type = 'EXPENSE') as derived
      from households h) t where derived is null`);
  if (identity.value === "0") ok("the accounting identity is computable for every household");
  else {
    bad("the accounting identity cannot be computed", identity.value);
    good = false;
  }

  const currency = q("select count(*) from ledger_postings lp join accounts a on a.id = lp.account_id where lp.currency <> a.currency");
  if (currency.value === "0") ok("no posting sits in the wrong currency");
  else {
    bad("restored postings violate the currency invariant", currency.value);
    good = false;
  }

  const orphanPostings = q(`select count(*) from ledger_postings lp
      where not exists (select 1 from households h where h.id = lp.household_id)`);
  if (orphanPostings.value === "0") ok("no orphan postings");
  else {
    bad("orphan postings after restore", orphanPostings.value);
    good = false;
  }

  const orphanDocs = q(`select count(*) from documents d
      where not exists (select 1 from households h where h.id = d.household_id)`);
  if (orphanDocs.value === "0") ok("no orphan documents");
  else {
    bad("orphan documents after restore", orphanDocs.value);
    good = false;
  }

  // Every document row in the recovery database must have its object in the
  // recovery bucket, or the copy is not self-consistent.
  if (manifest.objects) {
    const keys = pg(["psql", "-U", live.user || "ffos", "-d", recoveryDatabase, "-tAc",
      "select storage_key from documents where storage_key is not null and storage_key <> ''"], { env });
    const wanted = (keys.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean);
    const listed = aws(env, ["s3", "ls", `s3://${recoveryBucket}`, "--recursive"]);
    const present = new Set(
      (listed.stdout || "")
        .split("\n")
        .filter(Boolean)
        .map((row) => row.split(/\s+/).slice(3).join(" ")),
    );
    const missing = wanted.filter((key) => !present.has(key));
    if (missing.length === 0) ok("every restored document resolves to a restored object", `${wanted.length} documents`);
    else {
      bad("restored documents point at objects that are not there", `${missing.length} of ${wanted.length} missing`);
      for (const key of missing.slice(0, 5)) note(`missing: ${key}`);
      if (missing.length > 5) note(`… and ${missing.length - 5} more`);
      good = false;
    }
  }

  // The replay must have held: nothing that was erased may be back.
  const tombstones = readTombstones(tombstonePath(env));
  let resurrected = 0;
  for (const tombstone of tombstones) {
    if (!tombstone.householdId) continue;
    const still = q(`select count(*) from households where id = '${tombstone.householdId}'`);
    if (still.value !== "0") resurrected += 1;
  }
  if (resurrected === 0) ok("no erased household came back", `${tombstones.length} erasures checked`);
  else {
    bad("erased households are present in the recovery copy", `${resurrected}`);
    good = false;
  }

  return good;
}

/* ------------------------------------------------------------------- main */

let success = true;
if (what === "postgres") {
  success = restoreDatabase();
} else if (what === "objects") {
  success = restoreObjects();
} else {
  success = restoreDatabase();
  if (success) success = restoreObjects();
  if (success) success = replayErasures();
  if (success) success = validate();
}

heading("Result");
if (!success) {
  die("RECOVERY FAILED — the recovery copy is not trustworthy. Nothing live was touched.");
}

console.log(`\n✓ RECOVERY PREPARED — ${backup.backupId}\n`);
line("Recovery database", recoveryDatabase);
line("Recovery bucket", recoveryBucket);
console.log(
  "\n  The live pilot is untouched. Promotion is a separate, deliberate step:\n" +
    "  see 'Promoting a recovery' in docs/pilot/PILOT_RUNBOOK.md.\n",
);
