import {
  Body,
  Controller,
  Delete,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  householdIdParamSchema,
  householdInvitationParamsSchema,
  householdMemberParamsSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
} from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MembersService } from "./members.service";

type RequestWithId = Request & { requestId?: string };

@ApiTags("households")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/households/:householdId")
export class MembersController {
  constructor(
    @Inject(MembersService) private readonly members: MembersService,
  ) {}

  @Post("invitations")
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(householdIdParamSchema))
    params: { householdId: string },
    @Body(new ZodValidationPipe(inviteMemberSchema)) body: unknown,
    @Req() req: RequestWithId,
  ) {
    return this.members.inviteMember(
      user.userId,
      params.householdId,
      inviteMemberSchema.parse(body),
      req.requestId,
    );
  }

  @Delete("invitations/:invitationId")
  cancelInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(householdInvitationParamsSchema))
    params: { householdId: string; invitationId: string },
    @Req() req: RequestWithId,
  ) {
    return this.members.cancelInvitation(
      user.userId,
      params.householdId,
      params.invitationId,
      req.requestId,
    );
  }

  @Patch("members/:memberId/role")
  updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(householdMemberParamsSchema))
    params: { householdId: string; memberId: string },
    @Body(new ZodValidationPipe(updateMemberRoleSchema)) body: unknown,
    @Req() req: RequestWithId,
  ) {
    return this.members.updateMemberRole(
      user.userId,
      params.householdId,
      params.memberId,
      updateMemberRoleSchema.parse(body),
      req.requestId,
    );
  }

  @Delete("members/:memberId")
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(householdMemberParamsSchema))
    params: { householdId: string; memberId: string },
    @Req() req: RequestWithId,
  ) {
    return this.members.removeMember(
      user.userId,
      params.householdId,
      params.memberId,
      req.requestId,
    );
  }
}
