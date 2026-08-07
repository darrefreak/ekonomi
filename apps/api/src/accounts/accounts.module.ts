import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { AccountsController } from "./accounts.controller";
import { AccountsService } from "./accounts.service";

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
