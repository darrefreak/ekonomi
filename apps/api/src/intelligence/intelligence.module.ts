import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { HouseholdsModule } from "../households/households.module";
import { MetricsModule } from "../metrics/metrics.module";
import { ClassificationReviewService } from "./classification-review.service";
import { FinancialIntelligenceInputService } from "./financial-intelligence-input.service";
import { FinancialIntelligenceService } from "./financial-intelligence.service";
import { RecurringIntelligenceService } from "./recurring-intelligence.service";
import { TransactionClusteringService } from "./transaction-clustering.service";
import { IntelligenceController } from "./intelligence.controller";

/**
 * Financial Intelligence: the seam between the pure engine and a real household.
 */
@Module({
  imports: [AuthModule, HouseholdsModule, MetricsModule],
  controllers: [IntelligenceController],
  providers: [
    ClassificationReviewService,
    FinancialIntelligenceInputService,
    FinancialIntelligenceService,
    RecurringIntelligenceService,
    TransactionClusteringService,
  ],
  exports: [
    ClassificationReviewService,
    FinancialIntelligenceInputService,
    FinancialIntelligenceService,
    RecurringIntelligenceService,
    TransactionClusteringService,
  ],
})
export class IntelligenceModule {}
