import {
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { notifications } from "../db/schema-ops";
import { HouseholdAccessService } from "../households/household-access.service";
import { ReviewService } from "../review/review.service";

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(ReviewService) private readonly review: ReviewService,
  ) {}

  async list(userId: string, householdId: string) {
    await this.access.requireMembership(userId, householdId);
    await this.ensureBaseline(userId, householdId);
    const db = getDb();
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.householdId, householdId))
      .orderBy(desc(notifications.createdAt))
      .limit(40);
    const items = rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      href: r.href,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
    return {
      unreadCount: items.filter((i) => !i.readAt).length,
      items,
    };
  }

  async markRead(userId: string, householdId: string, notificationId: string) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    const [row] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.householdId, householdId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException("Notification not found");
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.id, notificationId));
    return this.list(userId, householdId);
  }

  async markAllRead(userId: string, householdId: string) {
    await this.access.requireMembership(userId, householdId);
    const db = getDb();
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.householdId, householdId),
          isNull(notifications.readAt),
        ),
      );
    return this.list(userId, householdId);
  }

  /** Seed thin baseline notifications from review backlog if table empty. */
  private async ensureBaseline(userId: string, householdId: string) {
    const db = getDb();
    const [existing] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.householdId, householdId))
      .limit(1);
    if (existing) return;

    const review = await this.review.list(userId, householdId);
    const rows: Array<typeof notifications.$inferInsert> = [];
    if (review.total > 0) {
      rows.push({
        householdId,
        type: "ACTION_REQUIRED",
        title: `${review.total} poster att granska`,
        body: "Öppna granskningskön för att klassificera okända rader.",
        href: "/review",
      });
    }
    rows.push({
      householdId,
      type: "INFO",
      title: "Välkommen till Family Financial OS",
      body: "Tips: använd Cmd/Ctrl+K för global sök.",
      href: "/",
    });
    if (rows.length) {
      await db.insert(notifications).values(rows);
    }
  }
}
