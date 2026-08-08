import { createHash } from "node:crypto";
import { ConflictException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client";
import { commandIdempotency } from "../db/schema-economic";

/**
 * Idempotency for aggregate commands that are not a single financial event.
 *
 * Three identities exist in this system and they are deliberately NOT
 * interchangeable:
 *
 *   Idempotency-Key   "is this HTTP command a retry of the same user intent?"
 *                     Client-generated, opaque, scoped to one command type.
 *   externalId        "is this the same record at the source provider?"
 *                     Provider-generated, used for import deduplication.
 *   business key      "does the domain forbid two entities like this?"
 *                     Declared by the domain; enforced with a domain error,
 *                     never with an idempotency conflict.
 *
 * Conflating the first two produced RT2-003; ignoring the first produced
 * RT2-002. This helper implements only the first.
 */

export type CommandType = "CREATE_ACCOUNT" | "CREATE_VEHICLE";

export function hashCommandRequest(request: unknown): string {
  const canonical = JSON.stringify(request, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  return createHash("sha256").update(canonical ?? "null").digest("hex");
}

function conflict(): never {
  throw new ConflictException({
    code: "IDEMPOTENCY_CONFLICT",
    message: "Samma idempotency-nyckel med annat innehåll.",
  });
}

/**
 * Run `command` at most once per (household, command type, idempotency key).
 *
 * Without a key the command simply runs inside one transaction — a client that
 * does not ask for retry protection does not get it, and two identical requests
 * are two genuine actions.
 *
 * With a key the reservation row and the command body share one transaction, so
 * either the whole aggregate and its idempotency record commit together or
 * neither does. Concurrency is handled by the unique index: `ON CONFLICT DO
 * NOTHING` makes a losing transaction wait on the winner's row lock, so by the
 * time it reads back the winner has committed and it returns the winner's
 * result instead of doing the work again.
 */
export async function runIdempotentCommand<T extends Record<string, unknown>>(input: {
  householdId: string;
  commandType: CommandType;
  idempotencyKey?: string | null;
  request: unknown;
  command: (tx: DbExecutor) => Promise<T>;
}): Promise<T> {
  const db = getDb();
  const key = input.idempotencyKey?.trim();
  if (!key) {
    return db.transaction(async (tx) => input.command(tx));
  }

  const requestHash = hashCommandRequest(input.request);

  return db.transaction(async (tx) => {
    const reserved = await tx
      .insert(commandIdempotency)
      .values({
        householdId: input.householdId,
        commandType: input.commandType,
        idempotencyKey: key,
        requestHash,
      })
      .onConflictDoNothing()
      .returning({ id: commandIdempotency.id });

    if (!reserved.length) {
      const [existing] = await tx
        .select()
        .from(commandIdempotency)
        .where(
          and(
            eq(commandIdempotency.householdId, input.householdId),
            eq(commandIdempotency.commandType, input.commandType),
            eq(commandIdempotency.idempotencyKey, key),
          ),
        )
        .limit(1);

      // The winner rolled back after we waited on its lock: the key is free
      // again, so this attempt is not a retry of anything.
      if (!existing) return input.command(tx);
      if (existing.requestHash !== requestHash) conflict();
      return (existing.result ?? {}) as T;
    }

    const result = await input.command(tx);
    await tx
      .update(commandIdempotency)
      .set({ result, completedAt: new Date() })
      .where(eq(commandIdempotency.id, reserved[0]!.id));
    return result;
  });
}
