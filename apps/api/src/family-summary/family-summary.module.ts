import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DecisionsModule } from "../decisions/decisions.module";
import { IntelligenceModule } from "../intelligence/intelligence.module";
import { FamilySummaryController } from "./family-summary.controller";
import { FamilySummaryService } from "./family-summary.service";

/**
 * Family summary: a thin composition layer over the intelligence and decision
 * engines. It owns no calculations, only the arrangement of existing ones into
 * the three questions a household asks.
 */
@Module({
  imports: [AuthModule, IntelligenceModule, DecisionsModule],
  controllers: [FamilySummaryController],
  providers: [FamilySummaryService],
  exports: [FamilySummaryService],
})
export class FamilySummaryModule {}
