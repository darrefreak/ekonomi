import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { ObjectStorageService } from "../storage/object-storage.service";
import { ErasureService } from "./erasure.service";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";

@Module({
  imports: [AuthModule, HouseholdsModule],
  controllers: [PrivacyController],
  providers: [PrivacyService, ErasureService, ObjectStorageService],
  exports: [PrivacyService, ErasureService],
})
export class PrivacyModule {}
