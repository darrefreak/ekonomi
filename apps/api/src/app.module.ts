import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AccountsModule } from "./accounts/accounts.module";
import { AiModule } from "./ai/ai.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { CashflowModule } from "./cashflow/cashflow.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { DebtModule } from "./debt/debt.module";
import { DecisionsModule } from "./decisions/decisions.module";
import { DemoModule } from "./demo/demo.module";
import { FeatureFlagsModule } from "./feature-flags/feature-flags.module";
import { FinancialCoverageModule } from "./financial-coverage/financial-coverage.module";
import { HealthModule } from "./health/health.module";
import { HouseholdsModule } from "./households/households.module";
import { IntakeModule } from "./intake/intake.module";
import { LedgerModule } from "./ledger/ledger.module";
import { MetricsModule } from "./metrics/metrics.module";
import { NetWorthModule } from "./net-worth/net-worth.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PlanningModule } from "./planning/planning.module";
import { PrivacyModule } from "./privacy/privacy.module";
import { ReportsModule } from "./reports/reports.module";
import { ReviewModule } from "./review/review.module";
import { SearchModule } from "./search/search.module";
import { SettingsModule } from "./settings/settings.module";
import { TransactionsModule } from "./transactions/transactions.module";
import { MerchantsModule } from "./merchants/merchants.module";
import { VehicleIntelModule } from "./vehicle-intel/vehicle-intel.module";
import { VehiclesModule } from "./vehicles/vehicles.module";
import { WealthModule } from "./wealth/wealth.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: 60_000,
        limit: 120,
      },
    ]),
    AuditModule,
    HealthModule,
    AuthModule,
    HouseholdsModule,
    AccountsModule,
    LedgerModule,
    MetricsModule,
    TransactionsModule,
    CashflowModule,
    NetWorthModule,
    FinancialCoverageModule,
    ReviewModule,
    PlanningModule,
    VehiclesModule,
    VehicleIntelModule,
    MerchantsModule,
    DecisionsModule,
    DebtModule,
    WealthModule,
    IntakeModule,
    AiModule,
    DashboardModule,
    FeatureFlagsModule,
    SettingsModule,
    SearchModule,
    NotificationsModule,
    ReportsModule,
    DemoModule,
    PrivacyModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
