import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { acceptInviteSchema } from "@ffos/schemas";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MembersService } from "./members.service";

@ApiTags("households")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("api/v1/invitations")
export class InvitationsController {
  constructor(
    @Inject(MembersService) private readonly members: MembersService,
  ) {}

  @Post("accept")
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(acceptInviteSchema)) body: unknown,
  ) {
    const input = acceptInviteSchema.parse(body);
    return this.members.acceptInvite(user.userId, user.email, input.token);
  }
}
