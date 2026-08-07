import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { householdMembers, households } from "../db/schema";

@Injectable()
export class HouseholdAccessService {
  async requireMembership(userId: string, householdId: string) {
    const db = getDb();
    const [household] = await db
      .select()
      .from(households)
      .where(eq(households.id, householdId))
      .limit(1);
    if (!household) {
      throw new NotFoundException("Household not found");
    }

    const [member] = await db
      .select()
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.userId, userId),
        ),
      )
      .limit(1);

    if (!member) {
      throw new ForbiddenException("Not a member of this household");
    }

    return { household, member };
  }
}
