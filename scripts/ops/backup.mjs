#!/usr/bin/env node
/**
 * Backups for the pilot.
 *
 *   pnpm backup:postgres        the database only
 *   pnpm backup:objects         object storage only
 *   pnpm backup:pilot           both, tied together by one manifest
 *   pnpm backup:prune           delete backups past the retention window
 *
 * A backup is only useful if you can tell what it is and whether it is intact,
 * so every run writes a manifest with the environment, the commit, the
 * migration state, sizes and SHA-256 checksums. A partial backup is never
 * marked COMPLETE: half a backup that looks whole is worse than none, because
 * it is the one you would reach for.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  assertKnownEnvironment,
  aws,
  backupId,
  backupRoot,
  bad,
  bucketSafety,
  describeDatabase,
  die,
  ensureDirectory,
  gitCommit,
  heading,
  line,
  listBackups,
  loadContext,
  migrationVersion,
  note,
  ok,
  pg,
  readTombstones,
  ROOT,
  sha256File,
  sha256String,
  tombstonePath,
  writeManifest,
} from "./lib.mjs";

const what = process.argv[2] ?? "pilot";
const env = loadContext();
assertKnownEnvironment(env);

const db = describeDatabase(env.DATABASE_URL);
const root = backupRoot(env);
if (!root) die("FFOS_BACKUP_DIR is not configured. A backup needs a destination outside the database volume.");
if (!db) die("DATABASE_URL does not name a database.");

/* ---------------------------------------------------------------- postgres */

function backupPostgres(targetDir) {
  const file = join(targetDir, `postgres-${db.database}.dump`);
  // Custom format: compressed, selective restore, and pg_restore's own
  // integrity checking. Nothing here re-implements PostgreSQL serialisation.
  const done = pg(["pg_dump", "-U", db.user || "ffos", "-Fc", "-d", db.database], {
    env,
    capture: false,
  });
  if (done.status !== 0) {
    return { ok: false, reason: (done.stderr?.toString() || "pg_dump failed").trim().split("\n").pop() };
  }
  writeFileSync(file, done.stdout);
  const bytes = statSync(file).size;
  if (bytes === 0) return { ok: false, reason: "pg_dump produced an empty file" };
  return {
    ok: true,
    file: relative(targetDir, file),
    bytes,
    sha256: sha256File(file),
    database: db.database,
    migrationVersion: migrationVersion(env, db.database),
  };
}

/* ----------------------------------------------------------------- objects */

function backupObjects(targetDir) {
  const bucket = env.S3_BUCKET;
  if (!bucket) return { ok: false, reason: "S3_BUCKET is not configured" };

  // Refuse to take a backup that the erasure architecture cannot honour: on a
  // versioned bucket the copy would carry object versions the live system
  // believes it deleted.
  const safety = bucketSafety(env, bucket);
  if (!safety.versioningSafe) {
    return {
      ok: false,
      reason: `bucket versioning is ${safety.versioning}; the pilot requires it off (see docs/pilot/PILOT_CONFIGURATION.md)`,
    };
  }

  const objectsDir = ensureDirectory(join(targetDir, "objects"));
  const sync = aws(env, ["s3", "sync", `s3://${bucket}`, objectsDir, "--delete", "--only-show-errors"]);
  if (sync.status !== 0) {
    return { ok: false, reason: (sync.stderr || "aws s3 sync failed").trim().split("\n").pop() };
  }

  // Per-object checksums, so a restore can prove the bytes came back and not
  // merely that the right number of files did.
  const entries = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else
        entries.push({
          key: relative(objectsDir, full).split("\\").join("/"),
          bytes: stat.size,
          sha256: sha256File(full),
        });
    }
  };
  if (existsSync(objectsDir)) walk(objectsDir);
  entries.sort((a, b) => (a.key < b.key ? -1 : 1));

  const listing = `${JSON.stringify({ bucket, objects: entries }, null, 2)}\n`;
  const listingFile = join(targetDir, "objects.json");
  writeFileSync(listingFile, listing);

  return {
    ok: true,
    bucket,
    directory: "objects",
    listing: "objects.json",
    count: entries.length,
    bytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    sha256: sha256String(listing),
  };
}

/* -------------------------------------------------------------- tombstones */

function copyTombstones(targetDir) {
  const source = tombstonePath(env);
  if (!source || !existsSync(source)) {
    return { present: false, count: 0 };
  }
  const contents = readFileSync(source, "utf8");
  const file = join(targetDir, "erasures.jsonl");
  writeFileSync(file, contents);
  return {
    present: true,
    file: "erasures.jsonl",
    count: readTombstones(source).length,
    sha256: sha256String(contents),
    note:
      "A snapshot for reference only. Recovery replays the live ledger, which is " +
      "authoritative precisely because a restore cannot roll it back.",
  };
}

/* -------------------------------------------------------------- retention */

function prune() {
  const days = Number(env.FFOS_BACKUP_RETENTION_DAYS ?? 14);
  const keepMinimum = Number(env.FFOS_BACKUP_RETENTION_MINIMUM ?? 3);
  heading("Backup retention");
  line("Retention window", `${days} days`);
  line("Always keep at least", `${keepMinimum} complete backups`);

  const all = listBackups(root);
  const complete = all.filter((b) => b.manifest?.status === "COMPLETE");
  const cutoff = Date.now() - days * 86_400_000;
  const keep = new Set(complete.slice(0, keepMinimum).map((b) => b.backupId));

  let removed = 0;
  for (const candidate of all) {
    if (keep.has(candidate.backupId)) continue;
    const created = Date.parse(candidate.manifest?.createdAt ?? candidate.createdAt);
    if (Number.isFinite(created) && created >= cutoff) continue;
    rmSync(candidate.path, { recursive: true, force: true });
    ok(`removed ${candidate.backupId}`, "past the retention window");
    removed += 1;
  }
  if (removed === 0) note("nothing was past the retention window");
  console.log(`\n✓ Retention applied: ${removed} removed, ${all.length - removed} kept.\n`);
}

/* ------------------------------------------------------------------- main */

if (what === "prune") {
  prune();
  process.exit(0);
}

const id = backupId();
const targetDir = ensureDirectory(join(root, id));

heading(`Backup ${id}`);
line("Environment", env.APP_ENV);
line("Database", db.describe());
line("Bucket", env.S3_BUCKET ?? "(none)");
line("Destination", targetDir);
note("No credential is written to the manifest or the log.");

const manifest = {
  backupId: id,
  createdAt: new Date().toISOString(),
  environment: env.APP_ENV,
  gitCommit: gitCommit(),
  scope: what,
  database: null,
  objects: null,
  tombstones: null,
  status: "INCOMPLETE",
};

let failed = false;

if (what === "postgres" || what === "pilot") {
  heading("PostgreSQL");
  const result = backupPostgres(targetDir);
  if (result.ok) {
    manifest.database = {
      name: result.database,
      file: result.file,
      bytes: result.bytes,
      sha256: result.sha256,
      migrationVersion: result.migrationVersion,
    };
    ok("database dumped", `${result.file}, ${(result.bytes / 1024).toFixed(0)} KiB`);
    ok("checksum recorded", result.sha256.slice(0, 16) + "…");
  } else {
    bad("database backup failed", result.reason);
    failed = true;
  }
}

if (what === "objects" || what === "pilot") {
  heading("Object storage");
  const result = backupObjects(targetDir);
  if (result.ok) {
    manifest.objects = {
      bucket: result.bucket,
      directory: result.directory,
      listing: result.listing,
      count: result.count,
      bytes: result.bytes,
      sha256: result.sha256,
    };
    ok("objects copied", `${result.count} objects, ${(result.bytes / 1024).toFixed(0)} KiB`);
    ok("per-object checksums recorded", `${result.listing}`);
  } else {
    bad("object backup failed", result.reason);
    failed = true;
  }
}

if (what === "pilot") {
  heading("Erasure ledger");
  const tombstones = copyTombstones(targetDir);
  manifest.tombstones = tombstones;
  if (tombstones.present) ok("ledger snapshot taken", `${tombstones.count} recorded erasures`);
  else note("no erasures recorded yet");
}

/* ------------------------------------------------------------ verification */

heading("Verification");

if (!failed && manifest.database) {
  const path = join(targetDir, manifest.database.file);
  const recomputed = sha256File(path);
  const matches = recomputed === manifest.database.sha256;
  if (matches) ok("database checksum verifies");
  else {
    bad("database checksum does not verify");
    failed = true;
  }
  // pg_restore reads the archive's own table of contents; if it cannot, the
  // dump is not restorable and calling it a backup would be false. The archive
  // has to land on a seekable file first — pg_restore cannot rewind a pipe.
  const listing = pg(
    [
      "sh",
      "-c",
      "cat > /tmp/ffos-verify.dump && pg_restore --list /tmp/ffos-verify.dump; " +
        "status=$?; rm -f /tmp/ffos-verify.dump; exit $status",
    ],
    { env, input: readFileSync(path) },
  );
  const readable = listing.status === 0 && (listing.stdout || "").includes("TABLE DATA");
  if (readable) ok("the dump is readable by pg_restore");
  else {
    bad("the dump is not readable by pg_restore", (listing.stderr || "").trim().split("\n").pop());
    failed = true;
  }
}

if (!failed && manifest.objects) {
  const listing = JSON.parse(readFileSync(join(targetDir, manifest.objects.listing), "utf8"));
  let mismatched = 0;
  for (const entry of listing.objects) {
    const full = join(targetDir, "objects", entry.key);
    if (!existsSync(full) || sha256File(full) !== entry.sha256) mismatched += 1;
  }
  if (mismatched === 0) ok("every copied object matches its checksum", `${listing.objects.length} objects`);
  else {
    bad("copied objects do not match their checksums", `${mismatched} mismatched`);
    failed = true;
  }
}

manifest.status = failed ? "FAILED" : "COMPLETE";
writeManifest(join(targetDir, "manifest.json"), manifest);

if (failed) {
  die(
    `BACKUP FAILED — ${id} is marked FAILED and must not be relied on. ` +
      "Fix the cause and take another backup before entering pilot data.",
  );
}

console.log(`\n✓ BACKUP COMPLETE — ${id}\n`);
console.log(`  manifest: ${join(targetDir, "manifest.json")}`);
console.log(`  restore:  pnpm recovery:prepare ${id}\n`);
