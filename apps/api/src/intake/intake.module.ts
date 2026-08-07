import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { IntakeController } from "./intake.controller";
import { IntakeService } from "./intake.service";

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [IntakeController],
  providers: [IntakeService],
})
export class IntakeModule {}
