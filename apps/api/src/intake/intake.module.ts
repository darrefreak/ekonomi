import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { ObjectStorageService } from "../storage/object-storage.service";
import { IntakeController } from "./intake.controller";
import { IntakeService } from "./intake.service";

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [IntakeController],
  providers: [IntakeService, ObjectStorageService],
  exports: [IntakeService],
})
export class IntakeModule {}
