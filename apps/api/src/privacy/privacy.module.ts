import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { StorageModule } from "../storage/storage.module";
import { ErasureService } from "./erasure.service";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";

@Module({
  imports: [AuthModule, HouseholdsModule, StorageModule],
  controllers: [PrivacyController],
  providers: [PrivacyService, ErasureService],
  exports: [PrivacyService, ErasureService],
})
export class PrivacyModule {}
