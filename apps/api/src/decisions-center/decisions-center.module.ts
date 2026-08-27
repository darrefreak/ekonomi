import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DebtModule } from "../debt/debt.module";
import { DecisionsModule } from "../decisions/decisions.module";
import { IntelligenceModule } from "../intelligence/intelligence.module";
import { DecisionsCenterController } from "./decisions-center.controller";
import { DecisionsCenterService } from "./decisions-center.service";

/**
 * Decision Center: a thin composition layer over the decision and intelligence
 * engines. It owns no calculation — it arranges opportunities, debt payoff,
 * liquidity/savings, anomalies and brief findings into one ranked action list.
 */
@Module({
  imports: [AuthModule, DecisionsModule, IntelligenceModule, DebtModule],
  controllers: [DecisionsCenterController],
  providers: [DecisionsCenterService],
  exports: [DecisionsCenterService],
})
export class DecisionsCenterModule {}
