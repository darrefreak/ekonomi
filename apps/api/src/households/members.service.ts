import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { InviteMemberInput, UpdateMemberRoleInput } from "@ffos/schemas";
import type { HouseholdRole } from "@ffos/domain";
import { getDb } from "../db/client";
import { householdInvitations, householdMembers, households } from "../db/schema";
import { HouseholdAccessService } from "./household-access.service";
import { AuditService } from "../audit/audit.service";
import { sendMail } from "../common/mail";
import { logger } from "../common/logger";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class MembersService {
  constructor(
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Used by SettingsService to embed invitations in the settings response. */
  async listInvitations(householdId: string) {
    const db = getDb();
    const rows = await db
      .select()
      .from(householdInvitations)
      .where(eq(householdInvitations.householdId, householdId))
      .orderBy(desc(householdInvitations.createdAt))
      .limit(100);
    return rows.map((row) => this.toInvitationDto(row));
  }

  async inviteMember(
    userId: string,
    householdId: string,
    input: InviteMemberInput,
    requestId?: string,
  ) {
    await this.access.requireAdmin(userId, householdId);
    if (input.householdId !== householdId) {
      throw new BadRequestException("householdId mismatch");
    }

    const db = getDb();
    const [household] = await db
      .select()
      .from(households)
      .where(eq(households.id, householdId))
      .limit(1);
    if (!household) throw new NotFoundException("Household not found");

    const email = input.email.trim().toLowerCase();
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const [row] = await db
      .insert(householdInvitations)
      .values({
        householdId,
        email,
        role: input.role,
        token,
        status: "PENDING",
        invitedByUserId: userId,
        expiresAt,
      })
      .returning();

    const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
    const acceptUrl = `${webOrigin}/invite?token=${token}`;
    const mailResult = await sendMail({
      to: email,
      subject: `Inbjudan till ${household.name}`,
      text: `Du har blivit inbjuden att gå med i hushållet "${household.name}".\n\nAcceptera inbjudan: ${acceptUrl}\n\nLänken är giltig i 7 dagar.`,
      html: `<p>Du har blivit inbjuden att gå med i hushållet <strong>${household.name}</strong>.</p><p><a href="${acceptUrl}">Acceptera inbjudan</a></p><p>Länken är giltig i 7 dagar.</p>`,
    });
    if (!mailResult.sent) {
      logger.warn("household_invite_mail_undelivered", {
        householdId,
        invitationId: row.id,
        error: mailResult.error,
      });
    }

    await this.audit.record({
      householdId,
      actorUserId: userId,
      action: "household.invite_member",
      entity: "household_invitation",
      entityId: row.id,
      after: { email: row.email, role: row.role, mailSent: mailResult.sent },
      requestId,
    });

    return this.toInvitationDto(row);
  }

  async cancelInvitation(
    userId: string,
    householdId: string,
    invitationId: string,
    requestId?: string,
  ) {
    await this.access.requireAdmin(userId, householdId);
    const db = getDb();
    const [invite] = await db
      .select()
      .from(householdInvitations)
      .where(
        and(
          eq(householdInvitations.id, invitationId),
          eq(householdInvitations.householdId, householdId),
        ),
      )
      .limit(1);
    if (!invite) throw new NotFoundException("Invitation not found");
    if (invite.status !== "PENDING") {
      throw new ConflictException("Only pending invitations can be cancelled");
    }

    const [updated] = await db
      .update(householdInvitations)
      .set({ status: "CANCELLED", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(householdInvitations.id, invitationId))
      .returning();

    await this.audit.record({
      householdId,
      actorUserId: userId,
      action: "household.cancel_invite",
      entity: "household_invitation",
      entityId: invitationId,
      before: { status: invite.status },
      after: { status: "CANCELLED" },
      requestId,
    });

    return this.toInvitationDto(updated);
  }

  async acceptInvite(userId: string, userEmail: string, token: string) {
    const db = getDb();
    const [invite] = await db
      .select()
      .from(householdInvitations)
      .where(eq(householdInvitations.token, token))
      .limit(1);
    if (!invite) throw new NotFoundException("Invitation not found");
    if (invite.status !== "PENDING") {
      throw new ConflictException("Invitation is no longer pending");
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await db
        .update(householdInvitations)
        .set({ status: "EXPIRED", updatedAt: new Date() })
        .where(eq(householdInvitations.id, invite.id));
      throw new ConflictException("Invitation has expired");
    }
    if (invite.email.toLowerCase() !== userEmail.trim().toLowerCase()) {
      throw new ForbiddenException(
        "This invitation was issued to a different email address",
      );
    }

    const [existingMember] = await db
      .select()
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, invite.householdId),
          eq(householdMembers.userId, userId),
        ),
      )
      .limit(1);

    const member = await db.transaction(async (tx) => {
      let memberRow = existingMember;
      if (!memberRow) {
        [memberRow] = await tx
          .insert(householdMembers)
          .values({
            householdId: invite.householdId,
            userId,
            role: invite.role,
            personalDataPolicy: "FULL_DETAILS",
          })
          .returning();
      }
      await tx
        .update(householdInvitations)
        .set({
          status: "ACCEPTED",
          acceptedByUserId: userId,
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(householdInvitations.id, invite.id));
      return memberRow;
    });

    await this.audit.record({
      householdId: invite.householdId,
      actorUserId: userId,
      action: "household.accept_invite",
      entity: "household_invitation",
      entityId: invite.id,
      after: { memberId: member.id, role: member.role },
    });

    return {
      householdId: invite.householdId,
      memberId: member.id,
      role: member.role,
    };
  }

  private async countOwners(householdId: string): Promise<number> {
    const db = getDb();
    const rows = await db
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.role, "OWNER"),
        ),
      );
    return rows.length;
  }

  async updateMemberRole(
    userId: string,
    householdId: string,
    memberId: string,
    input: UpdateMemberRoleInput,
    requestId?: string,
  ) {
    await this.access.requireAdmin(userId, householdId);
    if (input.householdId !== householdId) {
      throw new BadRequestException("householdId mismatch");
    }
    const nextRole = input.role as HouseholdRole;

    const db = getDb();
    const [member] = await db
      .select()
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.id, memberId),
          eq(householdMembers.householdId, householdId),
        ),
      )
      .limit(1);
    if (!member) throw new NotFoundException("Member not found");

    if (member.role === "OWNER" && nextRole !== "OWNER") {
      const ownerCount = await this.countOwners(householdId);
      if (ownerCount <= 1) {
        throw new BadRequestException("Cannot demote the last OWNER");
      }
    }

    const before = { role: member.role };
    const [updated] = await db
      .update(householdMembers)
      .set({ role: nextRole, updatedAt: new Date() })
      .where(eq(householdMembers.id, memberId))
      .returning();

    await this.audit.record({
      householdId,
      actorUserId: userId,
      action: "household.update_member_role",
      entity: "household_member",
      entityId: memberId,
      before,
      after: { role: nextRole },
      requestId,
    });

    return this.toMemberDto(updated);
  }

  async removeMember(
    userId: string,
    householdId: string,
    memberId: string,
    requestId?: string,
  ) {
    await this.access.requireAdmin(userId, householdId);

    const db = getDb();
    const [member] = await db
      .select()
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.id, memberId),
          eq(householdMembers.householdId, householdId),
        ),
      )
      .limit(1);
    if (!member) throw new NotFoundException("Member not found");

    if (member.role === "OWNER") {
      const ownerCount = await this.countOwners(householdId);
      if (ownerCount <= 1) {
        throw new BadRequestException(
          "Cannot remove the last OWNER of the household",
        );
      }
    }

    await db.delete(householdMembers).where(eq(householdMembers.id, memberId));

    await this.audit.record({
      householdId,
      actorUserId: userId,
      action: "household.remove_member",
      entity: "household_member",
      entityId: memberId,
      before: { userId: member.userId, role: member.role },
      requestId,
    });

    return { ok: true as const };
  }

  private toInvitationDto(row: typeof householdInvitations.$inferSelect) {
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toMemberDto(row: typeof householdMembers.$inferSelect) {
    return {
      id: row.id,
      userId: row.userId,
      role: row.role,
    };
  }
}
