import { z } from "zod";
import { uuidSchema } from "./common";

const inviteRoleSchema = z.enum(["ADMIN", "ADULT", "VIEWER", "CHILD"]);

export const inviteMemberSchema = z
  .object({
    householdId: uuidSchema,
    email: z.string().email().max(320),
    role: inviteRoleSchema.optional().default("ADULT"),
  })
  .strict();

export const acceptInviteSchema = z
  .object({
    token: z.string().min(16).max(64),
  })
  .strict();

export const updateMemberRoleSchema = z
  .object({
    householdId: uuidSchema,
    role: inviteRoleSchema,
  })
  .strict();

export const memberIdParamSchema = z.object({
  memberId: uuidSchema,
});

/** Path params for household-scoped nested routes (household + member/invitation). */
export const householdIdParamSchema = z.object({
  householdId: uuidSchema,
});

export const householdMemberParamsSchema = z.object({
  householdId: uuidSchema,
  memberId: uuidSchema,
});

export const householdInvitationParamsSchema = z.object({
  householdId: uuidSchema,
  invitationId: uuidSchema,
});

export const invitationSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: z.string(),
  status: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export const memberSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.string(),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type InvitationDto = z.infer<typeof invitationSchema>;
export type MemberDto = z.infer<typeof memberSchema>;
