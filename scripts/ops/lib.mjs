/**
 * Shared plumbing for the pilot operations commands.
 *
 * These commands exist because the go/no-go gate found the product technically
 * sound and operationally unready: erasure now genuinely destroys objects, and
 * there was no way to take a backup, no way to restore one, and no procedure
 * for stopping. Nothing here adds a product feature; it is the machinery that
 * makes running V1 with real money recoverable.
 *
 * Two rules shape the code:
 *
 *   Never print a credential. Connection strings, access keys and secrets are
 *   reduced to host/port/name before they reach a log.
 *
 *   Never guess at a destructive target. Every command states the environment,
 *   the database and the bucket it is about to touch, and refuses anything it
 *   was not explicitly pointed at.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/* ------------------------------------------------------------------ output */

const COLOURS = { pass: "\x1b[32m", fail: "\x1b[31m", warn: "\x1b[33m", dim: "\x1b[2m", off: "\x1b[0m" };

export function heading(text) {
  console.log(`\n${text}\n${"─".repeat(text.length)}`);
}

export function line(label, value) {
  console.log(`  ${label.padEnd(26)} ${value}`);
}

export function ok(text, detail = "") {
  console.log(`  ${COLOURS.pass}✓${COLOURS.off} ${text}${detail ? ` ${COLOURS.dim}${detail}${COLOURS.off}` : ""}`);
}

export function bad(text, detail = "") {
  console.log(`  ${COLOURS.fail}✗${COLOURS.off} ${text}${detail ? ` — ${detail}` : ""}`);
}

export function note(text) {
  console.log(`  ${COLOURS.dim}${text}${COLOURS.off}`);
}

export function die(message) {
  console.error(`\n${COLOURS.fail}✗ ${message}${COLOURS.off}\n`);
  process.exit(1);
}

/* ------------------------------------------------------------ environment */

/**
 * Which environment this is. Kept separate from `NODE_ENV`, which Node and the
 * framework also read: a pilot runs with `NODE_ENV=production` semantics but is
 * not the production deployment, and conflating the two is how a pilot ends up
 * pointed at a development database.
 */
export const ENVIRONMENTS = ["development", "test", "pilot", "production"];

export function loadEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return values;
}

/**
 * Environment resolution order: real process environment wins, then the env
 * file for the named environment, then `.env`. A pilot is expected to run with
 * `.env.pilot` present.
 */
export function loadContext(overrides = {}) {
  const appEnv = (process.env.APP_ENV ?? overrides.APP_ENV ?? "development").trim();
  const fromFile = {
    ...loadEnvFile(join(ROOT, ".env")),
    ...loadEnvFile(join(ROOT, `.env.${appEnv}`)),
  };
  const env = { ...fromFile, ...process.env, ...overrides };
  env.APP_ENV = appEnv;
  return env;
}

export function assertKnownEnvironment(env) {
  if (!ENVIRONMENTS.includes(env.APP_ENV)) {
    die(
      `APP_ENV is "${env.APP_ENV}". It must be one of: ${ENVIRONMENTS.join(", ")}. ` +
        "An unnamed environment is an unknown target and nothing here will act on one.",
    );
  }
}

/* ---------------------------------------------------------------- database */

/** Host, port and name only. The password never leaves this function. */
export function describeDatabase(url) {
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!database) return null;
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    database,
    user: decodeURIComponent(parsed.username || ""),
    describe: () => `${parsed.hostname}:${parsed.port || "5432"}/${database}`,
  };
}

const PROTECTED_DB = /(prod|production|staging|stage\b|live|pilot|customer)/i;

export function databaseKind(name) {
  if (PROTECTED_DB.test(name)) return "protected";
  if (/(^|_)test$/i.test(name)) return "test";
  if (/(^|_)dev$/i.test(name)) return "development";
  return "unknown";
}

/**
 * Run psql/pg_dump/pg_restore inside the Postgres container.
 *
 * The host has no PostgreSQL client binaries, and shelling into the container
 * is what an operator on this stack can actually do. The password is passed
 * through the environment rather than the command line, so it never appears in
 * a process listing.
 */
export function pg(args, { input, env, capture = true, container } = {}) {
  const ctx = env ?? {};
  const service = container ?? ctx.FFOS_PG_CONTAINER ?? "ekonomi-postgres-1";
  const target = describeDatabase(ctx.DATABASE_URL);
  const docker = [
    "exec",
    "-i",
    "-e",
    `PGPASSWORD=${ctx.PGPASSWORD ?? passwordOf(ctx.DATABASE_URL) ?? ""}`,
    service,
    ...args,
  ];
  const done = spawnSync("docker", docker, {
    input,
    encoding: capture ? "utf8" : "buffer",
    maxBuffer: 1024 * 1024 * 1024,
  });
  return { ...done, target };
}

function passwordOf(url) {
  try {
    return decodeURIComponent(new URL(url).password || "");
  } catch {
    return "";
  }
}

/** A single-value query against the given database. */
export function psqlValue(env, database, sql) {
  const done = pg(
    ["psql", "-U", describeDatabase(env.DATABASE_URL)?.user || "ffos", "-d", database, "-tAc", sql],
    { env },
  );
  if (done.status !== 0) {
    return { error: (done.stderr || "").trim() || "psql failed" };
  }
  return { value: (done.stdout || "").trim() };
}

/* ------------------------------------------------------------------- S3 */

/**
 * Object storage through the AWS CLI, which speaks S3 to MinIO and is the
 * established tool for this. Credentials go in the child environment only.
 */
export function aws(env, args, { capture = true } = {}) {
  const endpoint = env.S3_ENDPOINT;
  if (!endpoint) return { status: 1, stderr: "S3_ENDPOINT is not configured" };
  const done = spawnSync(
    "aws",
    ["--endpoint-url", endpoint, ...args],
    {
      encoding: capture ? "utf8" : "buffer",
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: env.S3_ACCESS_KEY ?? "",
        AWS_SECRET_ACCESS_KEY: env.S3_SECRET_KEY ?? "",
        AWS_DEFAULT_REGION: env.S3_REGION ?? "us-east-1",
        AWS_EC2_METADATA_DISABLED: "true",
      },
      maxBuffer: 1024 * 1024 * 256,
    },
  );
  return done;
}

export function bucketExists(env, bucket) {
  const done = aws(env, ["s3api", "head-bucket", "--bucket", bucket]);
  return done.status === 0;
}

/**
 * Bucket safety, measured rather than assumed.
 *
 * Versioning is the one that matters most: the final go/no-go proved that on a
 * versioned bucket a deleted object stays fully readable as a previous version
 * while the erasure reports success. It is therefore a hard precondition, not a
 * recommendation, and it is emphatically not the backup strategy.
 */
export function bucketSafety(env, bucket) {
  const versioning = aws(env, ["s3api", "get-bucket-versioning", "--bucket", bucket]);
  const lock = aws(env, ["s3api", "get-object-lock-configuration", "--bucket", bucket]);
  let versioningStatus = "disabled";
  if (versioning.status === 0 && (versioning.stdout || "").trim()) {
    try {
      const parsed = JSON.parse(versioning.stdout);
      versioningStatus = (parsed.Status ?? "disabled").toLowerCase();
    } catch {
      versioningStatus = "unreadable";
    }
  } else if (versioning.status !== 0) {
    versioningStatus = "unreadable";
  }
  // A bucket without object lock answers with an error; that is the good case.
  const lockEnabled = lock.status === 0 && /ObjectLockEnabled/.test(lock.stdout || "");
  return {
    versioning: versioningStatus,
    versioningSafe: versioningStatus === "disabled" || versioningStatus === "suspended",
    objectLock: lockEnabled ? "enabled" : "disabled",
    objectLockSafe: !lockEnabled,
  };
}

/* ------------------------------------------------------------- checksums */

export function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

export function sha256String(text) {
  return createHash("sha256").update(text).digest("hex");
}

/* --------------------------------------------------------------- backups */

export function backupRoot(env) {
  const configured = env.FFOS_BACKUP_DIR;
  if (!configured) return null;
  return resolve(ROOT, configured);
}

export function ensureDirectory(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

export function gitCommit() {
  const done = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  return done.status === 0 ? done.stdout.trim() : "unknown";
}

export function migrationVersion(env, database) {
  const result = psqlValue(
    env,
    database,
    "select coalesce(max(hash), 'none') from drizzle.__drizzle_migrations",
  );
  if (result.error) return "unknown";
  return result.value || "none";
}

export function readManifest(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function writeManifest(path, manifest) {
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return path;
}

export function listBackups(root) {
  if (!root || !existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => existsSync(join(root, name, "manifest.json")))
    .map((name) => ({
      backupId: name,
      path: join(root, name),
      manifest: readManifest(join(root, name, "manifest.json")),
      createdAt: statSync(join(root, name)).mtime.toISOString(),
    }))
    .sort((a, b) => (a.backupId < b.backupId ? 1 : -1));
}

export function resolveBackup(root, backupId) {
  if (!backupId || backupId === "latest") {
    const [newest] = listBackups(root).filter((b) => b.manifest?.status === "COMPLETE");
    return newest ?? null;
  }
  const path = join(root, backupId);
  if (!existsSync(join(path, "manifest.json"))) return null;
  return { backupId, path, manifest: readManifest(join(path, "manifest.json")) };
}

export function backupId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
  return `${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

/* -------------------------------------------------------------- tombstones */

/**
 * The erasure ledger.
 *
 * A backup taken before an erasure still contains the erased household. Restore
 * it naively and the participant's data is back, which would make the erasure a
 * lie. The ledger records that an erasure happened, lives outside the database
 * so restoring the database cannot roll it back, and is replayed over any
 * restored copy before that copy may be used.
 *
 * It holds identifiers only — household id, bucket and key — never names,
 * amounts or document contents.
 */
export function tombstonePath(env) {
  const dir = env.FFOS_ERASURE_LEDGER_DIR;
  if (!dir) return null;
  return join(resolve(ROOT, dir), "erasures.jsonl");
}

export function readTombstones(path) {
  if (!path || !existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((row) => {
      try {
        return JSON.parse(row);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
