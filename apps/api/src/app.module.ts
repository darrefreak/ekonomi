import { Module } from "@nestjs/common";
import { AccountsModule } from "./accounts/accounts.module";
import { AuthModule } from "./auth/auth.module";
import { CashflowModule } from "./cashflow/cashflow.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { FeatureFlagsModule } from "./feature-flags/feature-flags.module";
import { FinancialCoverageModule } from "./financial-coverage/financial-coverage.module";
import { HealthModule } from "./health/health.module";
import { HouseholdsModule } from "./households/households.module";
import { NetWorthModule } from "./net-worth/net-worth.module";
import { PlanningModule } from "./planning/planning.module";
import { ReviewModule } from "./review/review.module";
import { SettingsModule } from "./settings/settings.module";
import { TransactionsModule } from "./transactions/transactions.module";
import { VehiclesModule } from "./vehicles/vehicles.module";

@Module({
  imports: [
    HealthModule,
    AuthModule,
    HouseholdsModule,
    AccountsModule,
    TransactionsModule,
    CashflowModule,
    NetWorthModule,
    FinancialCoverageModule,
    ReviewModule,
    PlanningModule,
    VehiclesModule,
    DashboardModule,
    FeatureFlagsModule,
    SettingsModule,
  ],
})
export class AppModule {}
