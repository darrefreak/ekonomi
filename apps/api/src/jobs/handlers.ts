import type { JobPayload, JobType } from "@ffos/schemas";
import { asc, eq } from "drizzle-orm";
import { logger } from "../common/logger";
import { getDb } from "../db/client";
import { householdMembers } from "../db/schema";
import { AdvisorService } from "../ai/advisor.service";
import { AnalysisRunsService } from "../decisions/analysis-runs.service";
import { AnomalyService } from "../decisions/anomaly.service";
import { DecisionsService } from "../decisions/decisions.service";
import {
  OpportunitiesGeneratorService,
  resolveHouseholdCurrency,
} from "../decisions/opportunities-generator.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { HouseholdAccessService } from "../households/household-access.service";
import { HouseholdMetricsService } from "../metrics/household-metrics.service";
import { MetricRegistryService } from "../metrics/metric-registry.service";
import { IntakeService } from "../intake/intake.service";
import { AuditService } from "../audit/audit.service";
import { resolveHouseholdAsOf } from "../common/as-of";
import { DebtService } from "../debt/debt.service";
import { LedgerTruthService } from "../ledger/ledger-truth.service";
import { PlanningMetricsService } from "../planning/planning-metrics.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import { VehiclesService } from "../vehicles/vehicles.service";
import { VehicleIntelService } from "../vehicle-intel/vehicle-intel.service";

// asOf comes from the job payload; otherwise the household clock decides.

/** Job types that write a row to analysis_runs for the Settings status panel. */
const TRACKED_ANALYSIS_JOBS = new Set<JobType>([
  "CALCULATE_METRICS",
  "CALCULATE_NET_WORTH",
  "GENERATE_FORECAST",
  "GENERATE_OPPORTUNITIES",
  "RUN_RISK_ANALYSIS",
  "RUN_ANOMALY_ANALYSIS",
  "GENERATE_INSIGHTS",
  "GENERATE_AI_BRIEF",
]);

/**
 * Manual construction of getDb()-based services for job workers.
 * All services below have no external (non-DB) dependencies, so this
 * avoids booting a full Nest application context inside the worker.
 */
function buildServices() {
  const access = new HouseholdAccessService();
  const metrics = new HouseholdMetricsService();
  const planning = new PlanningMetricsService();
  const debt = new DebtService(access, metrics);
  const vehicles = new VehiclesService(access);
  const vehicleIntel = new VehicleIntelService(access, vehicles);
  const generator = new OpportunitiesGeneratorService();
  const decisions = new DecisionsService(access, metrics, planning, debt, vehicles, generator);
  const anomaly = new AnomalyService();
  const analysisRuns = new AnalysisRunsService();
  const metricRegistry = new MetricRegistryService(metrics);
  const flags = new FeatureFlagsService();
  const advisor = new AdvisorService(
    access,
    planning,
    decisions,
    vehicles,
    vehicleIntel,
    metrics,
    flags,
  );
  const audit = new AuditService();
  const ledger = new LedgerTruthService(audit);
  const storage = new ObjectStorageService();
  const intake = new IntakeService(access, storage);
  return {
    access,
    metrics,
    planning,
    debt,
    vehicles,
    generator,
    decisions,
    anomaly,
    analysisRuns,
    metricRegistry,
    advisor,
    ledger,
    intake,
  };
}

/** Resolves the longest-standing member (owner-ish) for job paths that need a userId. */
async function resolveHouseholdActorUserId(householdId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId))
    .orderBy(asc(householdMembers.createdAt))
    .limit(1);
  return row?.userId ?? null;
}

export type JobHandlerResult = Record<string, unknown> | null;

async function executeJob(
  services: ReturnType<typeof buildServices>,
  payload: JobPayload,
): Promise<JobHandlerResult> {
  switch (payload.type) {
    case "HEALTH_CHECK": {
      return { ok: true, at: new Date().toISOString() };
    }

    case "RECONCILE_ACCOUNT_BALANCES": {
      const asOf = await resolveHouseholdAsOf(payload.householdId, payload.asOf);
      const result = await services.ledger.reconcileHousehold(payload.householdId, asOf);
      return { asOf, updated: result.updated, mismatches: result.mismatches };
    }

    case "CALCULATE_METRICS":
    case "CALCULATE_NET_WORTH": {
      const asOf = await resolveHouseholdAsOf(payload.householdId, payload.asOf);
      const currency = await resolveHouseholdCurrency(payload.householdId);
      const result = await services.metricRegistry.materializeSnapshots(
        payload.householdId,
        currency,
        asOf,
      );
      return {
        asOf,
        bundleVersion: result.bundleVersion,
        inputHash: result.inputHash,
        itemCount: result.items.length,
      };
    }

    case "GENERATE_FORECAST": {
      const result = await services.decisions.generateForecast(payload.householdId);
      return { asOf: result.asOf, pointCount: result.points.length };
    }

    case "GENERATE_OPPORTUNITIES": {
      const asOf = await resolveHouseholdAsOf(payload.householdId, payload.asOf);
      const currency = await resolveHouseholdCurrency(payload.householdId);
      const detected = await services.generator.generate(payload.householdId, currency, asOf);
      return { asOf, detectedCount: detected.length };
    }

    case "RUN_RISK_ANALYSIS": {
      const result = await services.decisions.runRiskAnalysis(payload.householdId);
      return { asOf: result.asOf, signalCount: result.signals.length };
    }

    case "RUN_ANOMALY_ANALYSIS": {
      const asOf = await resolveHouseholdAsOf(payload.householdId, payload.asOf);
      const detected = await services.anomaly.run(payload.householdId, asOf);
      return { asOf, findingCount: detected.length };
    }

    case "GENERATE_INSIGHTS": {
      const result = await services.decisions.generateInsights(payload.householdId);
      return { asOf: result.asOf, itemCount: result.items.length };
    }

    case "GENERATE_AI_BRIEF": {
      const userId = await resolveHouseholdActorUserId(payload.householdId);
      if (!userId) {
        logger.warn("job_ai_brief_no_member", { householdId: payload.householdId });
        return { skipped: true, reason: "no_household_member" };
      }
      const result = await services.advisor.brief(userId, payload.householdId);
      return { asOf: result.asOf, headline: result.headline };
    }

    case "PROCESS_DOCUMENT": {
      const userId = await resolveHouseholdActorUserId(payload.householdId);
      if (!userId || !payload.entityId) {
        return { skipped: true, reason: !userId ? "no_household_member" : "missing_entityId" };
      }
      const doc = await services.intake.reextract(userId, payload.householdId, payload.entityId);
      return { documentId: doc.id, status: doc.status };
    }

    case "SYNC_INTEGRATION": {
      const userId = await resolveHouseholdActorUserId(payload.householdId);
      if (!userId) {
        return { skipped: true, reason: "no_household_member" };
      }
      const result = await services.intake.fakeSync(
        userId,
        payload.householdId,
        payload.entityId,
        "Scheduled sync job",
      );
      return { syncRunId: result.syncRunId, importBatchId: result.importBatchId };
    }

    default: {
      const _exhaustive: never = payload;
      throw new Error(`Unhandled job type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Dispatches a validated job payload to real service logic.
 * Kept independent of BullMQ so it can also be exercised by tests.
 */
export async function runJobHandler(payload: JobPayload): Promise<JobHandlerResult> {
  const services = buildServices();
  const track = TRACKED_ANALYSIS_JOBS.has(payload.type) && payload.householdId !== "system";
  const asOf =
    ("asOf" in payload && payload.asOf) ||
    (await resolveHouseholdAsOf(payload.householdId));
  const startedAt = new Date();

  if (!track) {
    return executeJob(services, payload);
  }

  try {
    const result = await executeJob(services, payload);
    await services.analysisRuns.record({
      householdId: payload.householdId,
      kind: payload.type,
      status: "READY",
      asOf: typeof result?.asOf === "string" ? result.asOf : asOf,
      summary: result ?? {},
      startedAt,
      finishedAt: new Date(),
    });
    return result;
  } catch (err) {
    await services.analysisRuns.record({
      householdId: payload.householdId,
      kind: payload.type,
      status: "FAILED",
      asOf,
      errorCode: err instanceof Error ? err.name : "JobError",
      summary: { message: err instanceof Error ? err.message : String(err) },
      startedAt,
      finishedAt: new Date(),
    });
    throw err;
  }
}
