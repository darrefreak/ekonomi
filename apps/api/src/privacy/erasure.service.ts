import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { households, householdMembers, users } from "../db/schema";
import { documents } from "../db/schema-intake";
import { privacyRequests } from "../db/schema-ops";
import { AuditService } from "../audit/audit.service";
import { HouseholdAccessService } from "../households/household-access.service";
import { ObjectStorageService } from "../storage/object-storage.service";

/** The seeded demo household, protected from erasure outside production. */
const DEMO_HOUSEHOLD_NAME = "Familjen Demo";

/**
 * Controlled erasure of a household and its data.
 *
 * Before this existed, `POST /privacy/delete-request` wrote a row saying the
 * participant wanted their data gone and nothing ever read it again (FPA-004).
 * A promise to erase that never erases is worse than no promise.
 *
 * The shape of the work is deliberately boring: asking and doing are separate
 * steps, doing is one transaction plus object-storage cleanup, and every step
 * can be repeated safely because a half-finished erasure must be resumable.
 */

export const ERASURE_STATUS = {
  requested: "requested",
  confirmed: "confirmed",
  processing: "processing",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
} as const;

export type ErasureStatus = (typeof ERASURE_STATUS)[keyof typeof ERASURE_STATUS];

/** Statuses from which execution may (re)start. `processing` is included so a crashed run resumes. */
const EXECUTABLE_FROM: ErasureStatus[] = [
  ERASURE_STATUS.confirmed,
  ERASURE_STATUS.processing,
  ERASURE_STATUS.failed,
];

export type ErasureSummary = {
  requestId: string;
  householdId: string;
  status: ErasureStatus;
  /** Objects this run deleted and then confirmed gone. */
  objectsRemoved: number;
  /** Objects the owning backend confirmed were not there to begin with. */
  objectsAlreadyAbsent?: number;
  rowsRemoved: Record<string, number>;
  completedAt: string | null;
};

/**
 * The erasure stopped because a store it must reach did not answer. Nothing has
 * been removed, the request stays retryable, and — the point — it does not say
 * completed.
 */
export class ErasureIncompleteError extends HttpException {
  constructor(readonly failures: string[]) {
    super(
      {
        code: "ERASURE_STORAGE_UNAVAILABLE",
        message:
          "Raderingen kunde inte slutföras: lagringen som innehåller filerna " +
          "svarade inte. Ingenting har tagits bort och begäran kan köras igen.",
        fields: { objects: failures.join("; ") },
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

@Injectable()
export class ErasureService {
  private readonly log = new Logger(ErasureService.name);

  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
  ) {}

  /**
   * Step two of two: the participant confirms a request they already made, by
   * typing the household's name. A single accidental click cannot erase
   * anything, because the click that creates the request does not execute it.
   */
  async confirm(
    userId: string,
    requestId: string,
    confirmation: { householdName: string },
  ): Promise<ErasureSummary> {
    const db = getDb();
    const [request] = await db
      .select()
      .from(privacyRequests)
      .where(eq(privacyRequests.id, requestId))
      .limit(1);
    if (!request || !request.householdId) {
      throw new NotFoundException("Privacy request not found");
    }
    if (request.kind !== "delete_household") {
      throw new BadRequestException(
        "Only a household deletion request can be confirmed here",
      );
    }

    // Authorisation is checked again at confirmation time: a request made while
    // someone was an owner must not still execute after they stopped being one.
    const { household, role } = await this.access.requireAdmin(
      userId,
      request.householdId,
    );
    if (role !== "OWNER") {
      throw new ForbiddenException("Only an owner can erase a household");
    }

    if (request.status === ERASURE_STATUS.completed) {
      return this.summaryOf(request.id, household.id, ERASURE_STATUS.completed);
    }
    if (request.status === ERASURE_STATUS.cancelled) {
      throw new ConflictException("This request was cancelled");
    }

    if (confirmation.householdName.trim() !== household.name.trim()) {
      throw new BadRequestException({
        code: "ERASURE_CONFIRMATION_MISMATCH",
        message: `Skriv hushållets namn exakt (${household.name}) för att bekräfta.`,
        fields: { householdName: "Namnet stämmer inte" },
      });
    }

    await db
      .update(privacyRequests)
      .set({ status: ERASURE_STATUS.confirmed, updatedAt: new Date() })
      .where(eq(privacyRequests.id, request.id));

    await this.audit.record({
      householdId: household.id,
      actorUserId: userId,
      action: "privacy.erasure_confirmed",
      entity: "privacy_request",
      entityId: request.id,
      after: { status: ERASURE_STATUS.confirmed },
    });

    return this.execute(request.id, userId);
  }

  async cancel(userId: string, requestId: string) {
    const db = getDb();
    const [request] = await db
      .select()
      .from(privacyRequests)
      .where(eq(privacyRequests.id, requestId))
      .limit(1);
    if (!request || !request.householdId) {
      throw new NotFoundException("Privacy request not found");
    }
    await this.access.requireAdmin(userId, request.householdId);
    if (request.status === ERASURE_STATUS.completed) {
      throw new ConflictException("This erasure has already run");
    }
    await db
      .update(privacyRequests)
      .set({ status: ERASURE_STATUS.cancelled, updatedAt: new Date() })
      .where(eq(privacyRequests.id, request.id));
    await this.audit.record({
      householdId: request.householdId,
      actorUserId: userId,
      action: "privacy.erasure_cancelled",
      entity: "privacy_request",
      entityId: request.id,
      after: { status: ERASURE_STATUS.cancelled },
    });
    return { id: request.id, status: ERASURE_STATUS.cancelled };
  }

  /**
   * Do the erasure, as a saga rather than a transaction.
   *
   * Postgres cannot enlist an object store, so the two are ordered instead:
   * every object is deleted and confirmed gone *before* the rows that hold the
   * keys are touched. If storage cannot be reached the erasure stops there,
   * having removed nothing, with the request left `failed` and every locator
   * still in place — so the retry has something to work from.
   *
   * The previous version deleted the rows regardless and reported completion,
   * which is how a document survived its own erasure with nothing left pointing
   * at it (FPR-003). Retry-safety was implemented as "never fail"; it is now
   * "fail, keep the evidence, and mean it when it says completed".
   */
  async execute(requestId: string, actorUserId: string | null): Promise<ErasureSummary> {
    const db = getDb();
    const [request] = await db
      .select()
      .from(privacyRequests)
      .where(eq(privacyRequests.id, requestId))
      .limit(1);
    if (!request) throw new NotFoundException("Privacy request not found");

    if (request.status === ERASURE_STATUS.completed || !request.householdId) {
      // The household is already gone; `household_id` was set to null by the
      // delete itself, which is what a finished erasure looks like.
      return this.summaryOf(requestId, null, ERASURE_STATUS.completed);
    }
    if (!EXECUTABLE_FROM.includes(request.status as ErasureStatus)) {
      throw new ConflictException(
        `An erasure in state "${request.status}" cannot be executed`,
      );
    }

    const householdId = request.householdId;
    await this.refuseSeededFixture(householdId);
    await db
      .update(privacyRequests)
      .set({ status: ERASURE_STATUS.processing, updatedAt: new Date() })
      .where(eq(privacyRequests.id, requestId));

    try {
      const objects = await this.removeStoredObjects(householdId);
      // Objects this run actually removed. One that was already gone is
      // confirmed absent but was not removed by us, and saying otherwise would
      // overstate what happened.
      const objectsRemoved = objects.deleted;
      const objectsAlreadyAbsent = objects.alreadyAbsent;
      const rowsRemoved = await this.removeHouseholdRows(householdId);

      await db
        .update(privacyRequests)
        .set({
          status: ERASURE_STATUS.completed,
          // The note may quote the participant's own words about their data.
          note: null,
          payload: {
            objectsRemoved,
            objectsAlreadyAbsent,
            rowsRemoved,
            completedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(privacyRequests.id, requestId));

      // A non-personal record that an erasure happened, kept deliberately:
      // see docs/privacy/ERASURE.md for what may remain and why.
      await this.audit.record({
        householdId: null,
        actorUserId,
        action: "privacy.erasure_completed",
        entity: "privacy_request",
        entityId: requestId,
        after: { objectsRemoved, objectsAlreadyAbsent, rowsRemoved },
      });

      this.log.log(`erasure_completed request=${requestId}`);
      return {
        requestId,
        householdId,
        status: ERASURE_STATUS.completed,
        objectsRemoved,
        objectsAlreadyAbsent,
        rowsRemoved,
        completedAt: new Date().toISOString(),
      };
    } catch (error) {
      await db
        .update(privacyRequests)
        .set({
          status: ERASURE_STATUS.failed,
          payload: {
            error: error instanceof Error ? error.message : String(error),
            failedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(privacyRequests.id, requestId));
      this.log.error(
        `erasure_failed request=${requestId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  /**
   * Keep the seeded demo out of harm's way on a laptop or in CI, where wiping
   * it breaks the fixtures every database-backed suite depends on.
   *
   * This is a development convenience, not a security control: in production
   * the only thing standing between a household and erasure is ownership.
   */
  private async refuseSeededFixture(householdId: string): Promise<void> {
    if (process.env.NODE_ENV === "production") return;
    const db = getDb();
    const [household] = await db
      .select({ name: households.name })
      .from(households)
      .where(eq(households.id, householdId))
      .limit(1);
    if (household?.name === DEMO_HOUSEHOLD_NAME) {
      throw new ForbiddenException(
        `The seeded demo household ("${DEMO_HOUSEHOLD_NAME}") cannot be erased ` +
          "outside production; the test fixtures depend on it.",
      );
    }
  }

  /**
   * Delete every stored object the household owns, and report only what the
   * owning backend confirmed.
   *
   * Counting the keys we looped over was the bug: it reported one object
   * removed while the object was untouched. Anything not confirmed gone stops
   * the erasure, because the next step destroys the only record of where that
   * object lives.
   */
  private async removeStoredObjects(
    householdId: string,
  ): Promise<{ deleted: number; alreadyAbsent: number }> {
    const db = getDb();
    const stored = await db
      .select({
        id: documents.id,
        storageKey: documents.storageKey,
        bucket: documents.bucket,
      })
      .from(documents)
      .where(eq(documents.householdId, householdId));

    let deleted = 0;
    let alreadyAbsent = 0;
    const failures: string[] = [];

    for (const object of stored) {
      const result = await this.storage.deleteObject(
        object.storageKey ?? "",
        object.bucket,
      );
      if (result.outcome === "DELETED_CONFIRMED") {
        deleted += 1;
      } else if (result.outcome === "ALREADY_ABSENT_CONFIRMED") {
        alreadyAbsent += 1;
      } else {
        failures.push(
          `${result.backend}:${result.bucket || "<no bucket recorded>"} ` +
            `[${result.errorKind ?? "UNKNOWN_STORAGE_ERROR"}] — ` +
            `${result.reason ?? "delete failed"}`,
        );
      }
    }

    // Nothing may be counted that the backend did not confirm, and nothing may
    // proceed while a single object is unaccounted for: the next step deletes
    // the rows that say where these objects live.
    if (failures.length > 0) {
      throw new ErasureIncompleteError(failures);
    }
    return { deleted, alreadyAbsent };
  }

  /**
   * Remove the household's rows.
   *
   * Almost every household-scoped table cascades from `households`, so the
   * single delete at the end does most of the work. The explicit statements
   * cover what does not cascade, which is exactly where orphans would otherwise
   * survive an erasure.
   */
  private async removeHouseholdRows(
    householdId: string,
  ): Promise<Record<string, number>> {
    const db = getDb();
    return db.transaction(async (tx) => {
      const removed: Record<string, number> = {};

      // No foreign key to households, so nothing would clean these up.
      const links = await tx.execute(
        sql`delete from source_transaction_links where household_id = ${householdId}`,
      );
      removed.source_transaction_links = links.rowCount ?? 0;

      // Audit rows are the deliberate exception: the security record that
      // something happened survives, stripped of anything about the household.
      const scrubbed = await tx.execute(
        sql`update audit_logs
            set "before" = null,
                "after" = null,
                entity_id = null,
                household_id = null
            where household_id = ${householdId}`,
      );
      removed.audit_logs_anonymised = scrubbed.rowCount ?? 0;

      const counted = await tx.execute(
        sql`select
              (select count(*) from accounts where household_id = ${householdId}) as accounts,
              (select count(*) from financial_events where household_id = ${householdId}) as financial_events,
              (select count(*) from ledger_postings where household_id = ${householdId}) as ledger_postings,
              (select count(*) from source_transactions where household_id = ${householdId}) as source_transactions,
              (select count(*) from raw_import_records where household_id = ${householdId}) as raw_import_records,
              (select count(*) from documents where household_id = ${householdId}) as documents,
              (select count(*) from vehicles where household_id = ${householdId}) as vehicles,
              (select count(*) from budget_periods where household_id = ${householdId}) as budget_periods,
              (select count(*) from household_members where household_id = ${householdId}) as household_members`,
      );
      const counts = (counted.rows?.[0] ?? {}) as Record<string, unknown>;
      for (const [table, value] of Object.entries(counts)) {
        removed[table] = Number(value ?? 0);
      }

      // Everything else cascades from here.
      const household = await tx.execute(
        sql`delete from households where id = ${householdId}`,
      );
      removed.households = household.rowCount ?? 0;

      return removed;
    });
  }

  private async summaryOf(
    requestId: string,
    householdId: string | null,
    status: ErasureStatus,
  ): Promise<ErasureSummary> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(privacyRequests)
      .where(eq(privacyRequests.id, requestId))
      .limit(1);
    const payload = (row?.payload ?? {}) as Record<string, unknown>;
    return {
      requestId,
      householdId: householdId ?? "",
      status,
      objectsRemoved: Number(payload.objectsRemoved ?? 0),
      rowsRemoved: (payload.rowsRemoved ?? {}) as Record<string, number>,
      completedAt: (payload.completedAt as string) ?? null,
    };
  }

  /**
   * Delete the signed-in user's own account.
   *
   * The awkward case is a sole owner: deleting them would leave a household
   * with data in it and nobody who can reach it, so that is refused and the
   * participant is told which of the two real options to take.
   */
  async deleteSelf(userId: string): Promise<{ deleted: true; householdsErased: number }> {
    const db = getDb();
    const memberships = await db
      .select({
        householdId: householdMembers.householdId,
        role: householdMembers.role,
      })
      .from(householdMembers)
      .where(eq(householdMembers.userId, userId));

    const blocking: string[] = [];
    const soleOwnerOfEmpty: string[] = [];

    for (const membership of memberships) {
      if (membership.role !== "OWNER") continue;
      const others = await db
        .select({ id: householdMembers.id, role: householdMembers.role })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, membership.householdId),
            sql`${householdMembers.userId} <> ${userId}`,
          ),
        );
      const otherOwners = others.filter((member) => member.role === "OWNER");
      if (otherOwners.length > 0) continue; // Someone else can still run it.
      if (others.length === 0) {
        soleOwnerOfEmpty.push(membership.householdId);
      } else {
        blocking.push(membership.householdId);
      }
    }

    if (blocking.length > 0) {
      throw new ConflictException({
        code: "SOLE_OWNER_OF_SHARED_HOUSEHOLD",
        message:
          "Du är enda ägare av ett hushåll som andra är med i. Gör någon annan " +
          "till ägare, eller radera hushållet först.",
        fields: { households: blocking.join(", ") },
      });
    }

    // A household only this user could reach goes with them; leaving it behind
    // would leave financial data nobody can read or delete.
    for (const householdId of soleOwnerOfEmpty) {
      // Same ordering as a household erasure: an unreachable store aborts the
      // user deletion rather than orphaning their documents.
      const objects = await this.removeStoredObjects(householdId);
      await this.removeHouseholdRows(householdId);
      this.log.log(
        `erasure_user_household household=${householdId} objects=${objects.deleted}`,
      );
    }

    await this.audit.record({
      householdId: null,
      actorUserId: userId,
      action: "privacy.user_deleted",
      entity: "user",
      entityId: userId,
      after: { householdsErased: soleOwnerOfEmpty.length },
    });

    // Memberships, refresh tokens and privacy requests all cascade from users.
    await db.delete(users).where(eq(users.id, userId));

    return { deleted: true, householdsErased: soleOwnerOfEmpty.length };
  }

  /** Household ids the user owns, for the settings surface. */
  async ownedHouseholds(userId: string) {
    const db = getDb();
    const rows = await db
      .select({
        id: households.id,
        name: households.name,
        role: householdMembers.role,
      })
      .from(householdMembers)
      .innerJoin(households, eq(households.id, householdMembers.householdId))
      .where(
        and(
          eq(householdMembers.userId, userId),
          inArray(householdMembers.role, ["OWNER"]),
        ),
      );
    return rows;
  }
}
