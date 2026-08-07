"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  AdvisorBriefResponse,
  AdvisorChatResponse,
  RecommendationOutcomesResponse,
} from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";

type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  citations?: AdvisorChatResponse["citations"];
  usedTools?: string[];
};

export function AdvisorPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [data, setData] = useState<AdvisorBriefResponse | null>(null);
  const [outcomes, setOutcomes] =
    useState<RecommendationOutcomesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const id = await ensureHouseholdSession();
      setHouseholdId(id);
      const flags = await api.getFeatureFlags();
      const enabled = flags.find((f) => f.key === "AI")?.enabled ?? false;
      setAiEnabled(enabled);
      if (!enabled) {
        setData(null);
        setOutcomes(null);
        return;
      }
      const [brief, outs] = await Promise.all([
        api.getAdvisorBrief(id),
        api.getRecommendationOutcomes(id),
      ]);
      setData(brief);
      setOutcomes(outs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(
    outcomeId: string,
    status: "ACCEPTED" | "DISMISSED" | "COMPLETED" | "OPENED",
  ) {
    if (!householdId) return;
    setBusyId(outcomeId);
    try {
      const next = await api.updateRecommendationOutcome(outcomeId, {
        householdId,
        status,
      });
      setOutcomes(next);
    } finally {
      setBusyId(null);
    }
  }

  async function sendChat() {
    if (!householdId || !chatInput.trim() || chatBusy) return;
    const message = chatInput.trim();
    setChatInput("");
    setChatTurns((prev) => [...prev, { role: "user", text: message }]);
    setChatBusy(true);
    try {
      const res = await api.advisorChat({ householdId, message });
      setChatTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.reply,
          citations: res.citations,
          usedTools: res.usedTools,
        },
      ]);
    } catch (err) {
      setChatTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          text:
            err instanceof Error
              ? err.message
              : "Kunde inte svara — kontrollera att AI-flaggan är på.",
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  }

  if (loading) return <LoadingState label="Hämtar AI-rådgivare…" />;

  if (aiEnabled === false) {
    return (
      <EmptyState
        title="AI-rådgivare är avstängd"
        description="Feature-flaggan AI är disabled. Aktivera den för att använda brief och chat (endast verktygsbaserade svar)."
      />
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Kunde inte hämta advisor"
        description={error ?? ""}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          AI-rådgivare
        </h1>
        <p className="mt-2 text-sm text-text-secondary">{data.headline}</p>
        <p className="mt-2 text-xs text-text-muted">{data.disclaimer}</p>
        <p className="mt-3 text-sm">
          <Link href="/opportunities" className="text-accent hover:underline">
            Opportunities →
          </Link>
          {" · "}
          <Link href="/risk" className="text-accent hover:underline">
            Risk →
          </Link>
        </p>
      </div>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm font-medium text-text-secondary">Chat</h2>
        <p className="mt-1 text-xs text-text-muted">
          Svar byggs bara från allowlistade read-only verktyg — inga påhittade belopp.
        </p>
        <div className="mt-4 max-h-80 space-y-3 overflow-y-auto">
          {chatTurns.length === 0 ? (
            <p className="text-sm text-text-muted">
              Fråga t.ex. om budget, möjligheter, risk eller nettoförmögenhet.
            </p>
          ) : (
            chatTurns.map((turn, i) => (
              <div
                key={`${turn.role}-${i}`}
                className={
                  turn.role === "user"
                    ? "rounded-[12px] bg-surface px-3 py-2 text-sm"
                    : "rounded-[12px] border border-border px-3 py-2 text-sm"
                }
              >
                <p className="text-xs text-text-muted">
                  {turn.role === "user" ? "Du" : "Rådgivare"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-text-secondary">
                  {turn.text}
                </p>
                {turn.citations && turn.citations.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                    {turn.citations.map((c, ci) => (
                      <li key={`${c.tool}-${ci}`}>
                        {c.href ? (
                          <Link href={c.href} className="text-accent hover:underline">
                            {c.label}
                          </Link>
                        ) : (
                          <span className="text-text-muted">{c.label}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {turn.usedTools?.length ? (
                  <p className="mt-1 text-xs text-text-muted">
                    Verktyg: {turn.usedTools.join(", ")}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            className="min-h-11 min-w-[16rem] flex-1 rounded-[12px] border border-border bg-surface px-3 text-sm"
            value={chatInput}
            placeholder="Ställ en fråga…"
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void sendChat();
            }}
          />
          <button
            type="button"
            disabled={chatBusy || !chatInput.trim()}
            className="rounded-[12px] bg-accent px-4 py-2 text-sm text-white disabled:opacity-60"
            onClick={() => void sendChat()}
          >
            {chatBusy ? "Tänker…" : "Skicka"}
          </button>
        </div>
      </section>

      <ul className="space-y-3">
        {data.sections.map((s) => (
          <li key={s.title} className="rounded-[16px] bg-surface-elevated p-5">
            <p className="font-medium">{s.title}</p>
            <p className="mt-2 text-sm text-text-secondary">{s.detail}</p>
            <p className="mt-3 text-xs text-text-muted">
              Källverktyg: {s.sourceTools.join(", ")}
            </p>
            {(s.citations ?? []).length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                {(s.citations ?? []).map((c, i) => (
                  <li key={`${s.title}-${i}`}>
                    {c.href ? (
                      <Link href={c.href} className="text-accent hover:underline">
                        {c.label}
                      </Link>
                    ) : (
                      <span className="text-text-muted">{c.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Tool trace (explainability)</h2>
        <ul className="mt-3 space-y-2 text-xs text-text-muted">
          {data.toolTrace.map((t) => (
            <li key={t.tool}>
              {t.ok ? "✓" : "✗"} {t.tool}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm text-text-secondary">Recommendation outcomes</h2>
        {!outcomes?.items.length ? (
          <EmptyState
            title="Inga outcomes ännu"
            description="När opportunities visas spåras de här."
          />
        ) : (
          outcomes.items.map((o) => (
            <article
              key={o.id}
              className="rounded-[16px] bg-surface-elevated p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{o.title}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {o.recommendationKey} · {o.status} ·{" "}
                    {new Date(o.shownAt).toLocaleString("sv-SE")}
                  </p>
                  {o.expectedImpact ? (
                    <p className="mt-2 text-sm">
                      Förväntad effekt: <MoneyValue value={o.expectedImpact} />
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  {(
                    [
                      ["ACCEPTED", "Acceptera"],
                      ["DISMISSED", "Avfärda"],
                      ["COMPLETED", "Klar"],
                    ] as const
                  ).map(([status, label]) => (
                    <button
                      key={status}
                      type="button"
                      disabled={busyId === o.id || o.status === status}
                      onClick={() => void setStatus(o.id, status)}
                      className="min-h-11 px-3 text-accent disabled:opacity-40"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
