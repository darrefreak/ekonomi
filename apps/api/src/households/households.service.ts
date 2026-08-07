import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { CreateHouseholdInput } from "@ffos/schemas";
import { getDb } from "../db/client";
import { auditLogs, householdMembers, households } from "../db/schema";
import { logger } from "../common/logger";

@Injectable()
export class HouseholdsService {
  async create(userId: string, input: CreateHouseholdInput, requestId?: string) {
    const db = getDb();
    const [household] = await db
      .insert(households)
      .values({
        name: input.name,
        baseCurrency: input.baseCurrency ?? "SEK",
      })
      .returning();

    await db.insert(householdMembers).values({
      householdId: household.id,
      userId,
      role: "OWNER",
      personalDataPolicy: "FULL_DETAILS",
    });

    await db.insert(auditLogs).values({
      householdId: household.id,
      actorUserId: userId,
      action: "household.create",
      entity: "household",
      entityId: household.id,
      after: { name: household.name, baseCurrency: household.baseCurrency },
      requestId,
      source: "api",
    });

    logger.info("household_created", { householdId: household.id, userId });
    return household;
  }

  async listForUser(userId: string) {
    const db = getDb();
    const rows = await db
      .select({
        id: households.id,
        name: households.name,
        baseCurrency: households.baseCurrency,
        role: householdMembers.role,
      })
      .from(householdMembers)
      .innerJoin(households, eq(householdMembers.householdId, households.id))
      .where(eq(householdMembers.userId, userId));
    return rows;
  }
}
