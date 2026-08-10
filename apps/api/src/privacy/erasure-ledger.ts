import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { Logger } from "@nestjs/common";

/**
 * The durable record that an erasure happened.
 *
 * Backup and the right to erasure pull against each other: a backup taken on
 * Monday still contains the household erased on Tuesday, and restoring it would
 * quietly undo the erasure. Something has to remember, and it cannot live in
 * the database, because restoring the database would roll that memory back
 * along with everything else.
 *
 * So the ledger is an append-only file outside the database, replayed over any
 * restored copy before that copy may be used
 * (`scripts/ops/recovery.mjs`, `docs/pilot/PILOT_RUNBOOK.md`).
 *
 * It records identifiers only — a household id, and the bucket and key of each
 * object — never a name, an amount or the contents of a document. That is
 * enough to delete the same things again and reveals nothing about the
 * participant if the file is read.
 */

const log = new Logger("ErasureLedger");

export type ErasureTombstone = {
  householdId: string;
  requestId: string;
  erasedAt: string;
  objects: Array<{ bucket: string | null; storageKey: string }>;
};

export class ErasureLedgerUnavailable extends Error {
  readonly code = "ERASURE_LEDGER_UNAVAILABLE";
  constructor(reason: string) {
    super(
      `The erasure could not be recorded in the durable ledger (${reason}). ` +
        "Nothing has been deleted from the database; retry once the ledger is writable.",
    );
    this.name = "ErasureLedgerUnavailable";
  }
}

export function erasureLedgerFile(env: NodeJS.ProcessEnv = process.env): string | null {
  const dir = env.FFOS_ERASURE_LEDGER_DIR;
  if (!dir || !dir.trim()) return null;
  return path.join(dir.trim(), "erasures.jsonl");
}

/**
 * Append one tombstone.
 *
 * Called after every object is confirmed gone and before the rows are deleted,
 * which is the only ordering that is safe in both directions: the objects are
 * already irreversibly gone, so the record is true; and if the append fails,
 * the rows are still there and the whole erasure can be retried.
 *
 * When no ledger is configured — development, tests — this is a no-op, because
 * there is no backup regime to protect. A pilot or production deployment
 * configures one, and `pnpm pilot:preflight` refuses to start without it.
 */
export function recordErasure(
  tombstone: ErasureTombstone,
  env: NodeJS.ProcessEnv = process.env,
): "recorded" | "not-configured" {
  const file = erasureLedgerFile(env);
  if (!file) return "not-configured";

  try {
    const dir = path.dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(file, `${JSON.stringify(tombstone)}\n`, { encoding: "utf8" });
    log.log(
      `erasure_recorded household=${tombstone.householdId} objects=${tombstone.objects.length}`,
    );
    return "recorded";
  } catch (error) {
    throw new ErasureLedgerUnavailable(
      error instanceof Error ? error.message : "write failed",
    );
  }
}
