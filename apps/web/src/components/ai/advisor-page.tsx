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
import { describeError } from "@/lib/error-message";

type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  citations?: AdvisorChatResponse["citations"];
  usedTools?: string[];
};

const outcomeStatusLabels: Record<string, string> = {
  OPENED: "Öppnad",
  ACCEPTED: "Accepterad",
  DISMISSED: "Inte relevant",
  COMPLETED: "Genomförd",
};

const verificationLabels: Record<string, string> = {
  AWAITING_EVIDENCE: "Inväntar underlag",
  VERIFIED: "Verifierad",
  PARTIALLY_VERIFIED: "Delvis verifierad",
  NOT_VERIFIED: "Inte verifierad",
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
      setError(describeError(err, "Något gick fel"));
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
          text: describeError(
            err,
            "Jag kunde inte svara just nu. Försök igen om en stund.",
          ),
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
        title="Rådgivaren är inte aktiverad"
        description="Övriga beräkningar och insikter fungerar som vanligt. Rådgivaren kan aktiveras av hushållets administratör."
      />
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Kunde inte hämta rådgivaren"
        description={error ?? ""}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Rådgivare
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          Ställ frågor om hushållets ekonomi och få svar med länkar till
          underlaget.
        </p>
        <p className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link
            href="/opportunities"
            className="inline-flex min-h-11 items-center text-accent hover:underline"
          >
            Möjligheter →
          </Link>
          <Link
            href="/risk"
            className="inline-flex min-h-11 items-center text-accent hover:underline"
          >
            Risker →
          </Link>
        </p>
        <details className="mt-3 text-sm text-text-secondary">
          <summary className="flex min-h-11 cursor-pointer items-center text-accent">
            Så bygger rådgivaren sina svar
          </summary>
          <p className="max-w-2xl text-xs leading-5 text-text-muted">
            Belopp hämtas från hushållets beräknade underlag. Rådgivaren
            förklarar siffrorna men hittar inte på egna belopp. {data.disclaimer}
          </p>
        </details>
      </div>

      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm font-medium text-text-secondary">
          Fråga rådgivaren
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Svaren bygger på hushållets egna siffror och ändrar aldrig data.
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
                          <Link
                            href={c.href}
                            className="inline-flex min-h-11 items-center text-accent hover:underline"
                          >
                            {c.label}
                          </Link>
                        ) : (
                          <span className="text-text-muted">{c.label}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            className="min-h-11 min-w-[16rem] flex-1 rounded-[12px] border border-border bg-surface px-3 text-sm"
            value={chatInput}
            aria-label="Din fråga till rådgivaren"
            placeholder="Ställ en fråga…"
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void sendChat();
            }}
          />
          <button
            type="button"
            disabled={chatBusy || !chatInput.trim()}
            className="min-h-12 rounded-[12px] bg-accent px-4 text-sm text-on-accent disabled:opacity-60"
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
            {(s.citations ?? []).length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                {(s.citations ?? []).map((c, i) => (
                  <li key={`${s.title}-${i}`}>
                    {c.href ? (
                      <Link
                        href={c.href}
                        className="inline-flex min-h-11 items-center text-accent hover:underline"
                      >
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

      <section className="space-y-3">
        <h2 className="text-sm text-text-secondary">Tidigare rekommendationer</h2>
        {!outcomes?.items.length ? (
          <EmptyState
            title="Inga tidigare rekommendationer"
            description="När du öppnar eller agerar på ett förslag syns det här."
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
                    {outcomeStatusLabels[o.status] ?? "Pågående"} ·{" "}
                    {new Date(o.shownAt).toLocaleString("sv-SE")}
                  </p>
                  {o.expectedImpact ? (
                    <p className="mt-2 text-sm">
                      Förväntad effekt: <MoneyValue value={o.expectedImpact} />
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-text-muted">
                    Uppföljning:{" "}
                    {verificationLabels[o.verificationStatus ?? "AWAITING_EVIDENCE"] ??
                      "Inväntar underlag"}
                    {o.verifiedImpact ? (
                      <>
                        {" · Verifierad: "}
                        <MoneyValue value={o.verifiedImpact} />
                      </>
                    ) : null}
                  </p>
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
