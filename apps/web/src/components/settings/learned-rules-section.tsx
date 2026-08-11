"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { describeError } from "@/lib/error-message";

/**
 * The classification rules the household has taught the system.
 *
 * Every "Kom ihåg detta för framtiden" ends up here, so a wrong lesson is never
 * permanent: a rule can be paused or removed, and the next analysis simply
 * stops applying it.
 */
export function LearnedRulesSection({ householdId }: { householdId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const rulesQuery = useQuery({
    queryKey: queryKeys.intelligence.rules(householdId),
    queryFn: () => api.getClassificationRules(householdId),
  });

  const invalidate = async () => {
    setError(null);
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.intelligence.rules(householdId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.intelligence.review(householdId),
      }),
    ]);
  };

  const toggleMutation = useMutation({
    mutationFn: ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) =>
      api.updateClassificationRule(ruleId, { householdId, enabled }),
    onSuccess: invalidate,
    onError: (err) => setError(describeError(err, "Kunde inte uppdatera regeln")),
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => api.deleteClassificationRule(ruleId, householdId),
    onSuccess: invalidate,
    onError: (err) => setError(describeError(err, "Kunde inte ta bort regeln")),
  });

  const busy = toggleMutation.isPending || deleteMutation.isPending;
  const items = rulesQuery.data?.items ?? [];

  return (
    <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
      <h2 className="text-sm text-text-secondary">Inlärda regler</h2>
      <p className="text-sm text-text-secondary">
        Regler som skapats när du rättat klassificeringar. De gäller bara detta
        hushåll och kan pausas eller tas bort när som helst.
      </p>
      {error ? (
        <p className="text-sm text-warning" role="alert">
          {error}
        </p>
      ) : null}
      {rulesQuery.isLoading ? (
        <p className="text-sm text-text-secondary">Hämtar regler…</p>
      ) : rulesQuery.isError ? (
        <p className="text-sm text-warning" role="alert">
          {describeError(rulesQuery.error, "Kunde inte hämta reglerna")}
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-secondary">
          Inga inlärda regler ännu. Rätta ett mönster under Granska och välj
          &quot;Kom ihåg detta för framtiden&quot;.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center gap-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium">
                  {rule.merchantName ?? "Ingen mottagare"}
                  {rule.categoryName ? ` · ${rule.categoryName}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  Mönster: {rule.matchValue}
                  {rule.matchCount > 0
                    ? ` · Har använts ${rule.matchCount} ${rule.matchCount === 1 ? "gång" : "gånger"}`
                    : " · Har inte använts ännu"}
                  {!rule.enabled ? " · Pausad" : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                className="min-h-11 rounded-[12px] border border-border px-3 text-sm disabled:opacity-50"
                onClick={() =>
                  toggleMutation.mutate({ ruleId: rule.id, enabled: !rule.enabled })
                }
              >
                {rule.enabled ? "Pausa" : "Aktivera"}
              </button>
              <button
                type="button"
                disabled={busy}
                className="min-h-11 rounded-[12px] border border-border px-3 text-sm text-warning disabled:opacity-50"
                onClick={() => deleteMutation.mutate(rule.id)}
              >
                Ta bort
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
