import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdAccessService } from "./household-access.service";
import { HouseholdsController } from "./households.controller";
import { HouseholdsService } from "./households.service";
import { InvitationsController } from "./invitations.controller";
import { MembersController } from "./members.controller";
import { MembersService } from "./members.service";

@Module({
  imports: [AuthModule],
  controllers: [HouseholdsController, MembersController, InvitationsController],
  providers: [HouseholdsService, HouseholdAccessService, MembersService],
  exports: [HouseholdsService, HouseholdAccessService, MembersService],
})
export class HouseholdsModule {}
