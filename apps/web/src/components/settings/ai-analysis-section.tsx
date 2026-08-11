"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SettingsResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { describeError } from "@/lib/error-message";

/**
 * "Extern AI-analys av transaktioner" — the household's explicit opt-in for
 * sending minimized, redacted transaction text to the configured AI provider
 * (§21). The section also shows the honest AI status (§50): whether the
 * environment allows external calls at all, and what the household has spent.
 */
export function AiAnalysisSection({
  householdId,
  data,
}: {
  householdId: string;
  data: SettingsResponse;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: queryKeys.intelligence.aiStatus(householdId),
    queryFn: () => api.getAiStatus(householdId),
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.updateSettings({ householdId, aiTransactionAnalysisEnabled: enabled }),
    onSuccess: async () => {
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.all(householdId) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.intelligence.aiStatus(householdId),
        }),
      ]);
    },
    onError: (err) =>
      setError(describeError(err, "Kunde inte uppdatera AI-inställningen")),
  });

  const enabled = data.aiTransactionAnalysisEnabled;
  const status = statusQuery.data;

  return (
    <section
      className="space-y-3 rounded-[16px] bg-surface-elevated p-5"
      data-testid="ai-analysis-section"
    >
      <h2 className="text-sm text-text-secondary">Extern AI-analys av transaktioner</h2>
      <p className="text-sm text-text-secondary">
        När detta är aktiverat kan minimerad transaktionstext skickas till vald
        AI-tjänst för att hjälpa till att identifiera handlare och kategori.
        Personnummer, kontonummer, telefonnummer och betalningsreferenser
        maskeras alltid innan något skickas — hela din bankhistorik lämnar
        aldrig systemet.
      </p>

      {error ? (
        <p className="text-sm text-warning" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={toggleMutation.isPending}
          data-testid="ai-analysis-toggle"
          aria-pressed={enabled}
          className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm disabled:opacity-50"
          onClick={() => toggleMutation.mutate(!enabled)}
        >
          {enabled ? "Stäng av" : "Aktivera"}
        </button>
        <span
          className={`text-sm ${enabled ? "text-positive" : "text-text-secondary"}`}
          data-testid="ai-analysis-state"
        >
          {enabled ? "Aktiverad för hushållet" : "Avstängd"}
        </span>
      </div>

      {!enabled ? (
        <p className="text-sm text-text-muted" data-testid="ai-analysis-off-note">
          Extern AI-analys är avstängd. Systemets automatiska analys fungerar
          fortfarande.
        </p>
      ) : null}

      {statusQuery.isLoading ? (
        <p className="text-sm text-text-muted">Hämtar AI-status…</p>
      ) : status ? (
        <div className="space-y-2 rounded-[12px] border border-border p-3">
          <p className="text-xs font-medium text-text-secondary">Status</p>
          <ul className="space-y-1 text-xs text-text-secondary">
            <li>
              Extern anslutning:{" "}
              {status.externalCallsAllowed
                ? "tillåten"
                : status.dryRunForced
                  ? "testläge (dry-run) — inget skickas externt"
                  : "inte tillåten i denna miljö"}
            </li>
            <li>
              AI-tjänst: {status.providerConfigured ? (status.model ?? "konfigurerad") : "inte konfigurerad"}
            </li>
            <li>
              Skickade mönster: {status.metrics.clustersSent} · Anrop:{" "}
              {status.metrics.requests} · Återanvända svar: {status.metrics.cacheHits} ·
              Fel: {status.metrics.failures}
            </li>
            {status.metrics.estimatedCostText ? (
              <li>Uppskattad kostnad: {status.metrics.estimatedCostText}</li>
            ) : null}
          </ul>
        </div>
      ) : statusQuery.isError ? (
        <p className="text-sm text-text-muted">
          AI-status kunde inte hämtas just nu. Din ekonomiska analys påverkas inte.
        </p>
      ) : null}
    </section>
  );
}
