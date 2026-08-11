"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { describeError } from "@/lib/error-message";
import { invalidateAfterFinancialImport } from "@/lib/query-keys";

/**
 * The first ten minutes: what happens right after an import.
 *
 * Instead of dropping the user onto a dashboard, the pipeline is run and its
 * real stages are shown — no invented timers. Each line flips to done when the
 * request behind it actually resolves, and the completion card's numbers come
 * straight from the analysis result.
 */

type AnalysisSummary = {
  transactionsAnalyzed: number;
  understoodPercent: number;
  recurringStreams: number;
  subscriptions: number;
  reviewCount: number;
};

type Phase = "analyzing" | "preparing" | "done" | "error";

export function AnalysisExperience({
  householdId,
  importedCount,
  onDismiss,
}: {
  householdId: string;
  importedCount: number;
  onDismiss?: () => void;
}) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("analyzing");
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        // Stage 1 — the real pipeline: clustering, merchants, classification,
        // recurring detection. One request; its completion is the progress.
        const analysis = await api.runIntelligenceAnalysis(householdId);
        setPhase("preparing");
        // Stage 2 — what still needs the user, plus warm the insight caches.
        const review = await api.getClusterReview(householdId);
        await invalidateAfterFinancialImport(queryClient, householdId);
        setSummary({
          transactionsAnalyzed: analysis.coverage.total,
          understoodPercent: analysis.coverage.meaningfullyClassifiedPercent,
          recurringStreams: analysis.recurring.recurringStreams,
          subscriptions: analysis.recurring.subscriptions,
          reviewCount: review.total,
        });
        setPhase("done");
      } catch (err) {
        setError(
          describeError(
            err,
            "Analysen kunde inte slutföras. Dina importerade transaktioner finns kvar.",
          ),
        );
        setPhase("error");
      }
    })();
  }, [householdId, queryClient]);

  if (phase === "error") {
    return (
      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm font-medium text-text-secondary">Analysen avbröts</h2>
        <p role="alert" className="text-sm text-text-secondary">
          {error}
        </p>
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-medium text-accent">
          Gå till översikten →
        </Link>
      </section>
    );
  }

  if (phase !== "done" || !summary) {
    return (
      <section
        className="space-y-4 rounded-[16px] bg-surface-elevated p-5"
        data-testid="analysis-progress"
        aria-live="polite"
      >
        <h2 className="text-sm font-medium text-text-secondary">
          Analyserar din ekonomi
        </h2>
        <ol className="space-y-2 text-sm">
          <ProgressLine state="done">
            {importedCount.toLocaleString("sv-SE")} transaktioner importerade
          </ProgressLine>
          <ProgressLine state={phase === "analyzing" ? "active" : "done"}>
            Identifierar handlare, kategorier och återkommande mönster
          </ProgressLine>
          <ProgressLine state={phase === "preparing" ? "active" : "pending"}>
            Förbereder ekonomiska insikter
          </ProgressLine>
        </ol>
      </section>
    );
  }

  return (
    <section
      className="space-y-4 rounded-[16px] bg-surface-elevated p-5"
      data-testid="analysis-complete"
    >
      <div>
        <h2 className="font-[family-name:var(--ffos-font-display)] text-2xl tracking-tight">
          Din ekonomi är analyserad
        </h2>
      </div>
      <ul className="space-y-1.5 text-sm">
        <SummaryLine>
          <strong className="tabular-nums">
            {summary.transactionsAnalyzed.toLocaleString("sv-SE")}
          </strong>{" "}
          transaktioner analyserade
        </SummaryLine>
        <SummaryLine>
          <strong className="tabular-nums">
            {Math.round(summary.understoodPercent)} %
          </strong>{" "}
          förstådda automatiskt
        </SummaryLine>
        <SummaryLine>
          <strong className="tabular-nums">{summary.recurringStreams}</strong>{" "}
          återkommande betalningar hittades
        </SummaryLine>
        <SummaryLine>
          <strong className="tabular-nums">{summary.subscriptions}</strong>{" "}
          abonnemang identifierades
        </SummaryLine>
        <SummaryLine>
          <strong className="tabular-nums">{summary.reviewCount}</strong>{" "}
          {summary.reviewCount === 1 ? "sak behöver" : "saker behöver"} din hjälp
        </SummaryLine>
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        {summary.reviewCount > 0 ? (
          <Link
            href="/review"
            className="flex min-h-11 items-center justify-center rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent"
          >
            Slutför analysen
          </Link>
        ) : null}
        <Link
          href="/"
          className={`flex min-h-11 items-center justify-center rounded-[12px] px-4 text-sm ${
            summary.reviewCount > 0
              ? "border border-border-strong"
              : "bg-accent font-medium text-on-accent"
          }`}
        >
          Gå till översikten
        </Link>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-11 rounded-[12px] px-4 text-sm text-text-muted"
          >
            Importera en till fil
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ProgressLine({
  state,
  children,
}: {
  state: "done" | "active" | "pending";
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
          state === "done"
            ? "bg-positive/15 text-positive"
            : state === "active"
              ? "bg-accent/15 text-accent"
              : "bg-surface text-text-muted"
        }`}
      >
        {state === "done" ? "✓" : state === "active" ? "…" : ""}
      </span>
      <span
        className={
          state === "pending" ? "text-text-muted" : "text-text-primary"
        }
      >
        {children}
        {state === "active" ? "…" : ""}
      </span>
    </li>
  );
}

function SummaryLine({ children }: { children: React.ReactNode }) {
  return <li className="text-text-secondary">{children}</li>;
}
