"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { AdvisorChatResponse, AdvisorPageContext } from "@ffos/schemas";
import { api } from "@/lib/api";
import { useHouseholdId } from "@/lib/use-household-id";

/**
 * The contextual Advisor: available on every page, not only on /advisor.
 *
 * Desktop gets a right-side panel, mobile a bottom sheet. The panel knows
 * which page it was opened from and sends that as safe structured context —
 * a route name and entity type, never free-form page content — so the
 * deterministic tools behind the advisor can be chosen to match. Suggested
 * questions change with the page for the same reason.
 */

const SUGGESTIONS: Array<{ prefix: string; questions: string[] }> = [
  { prefix: "/what-changed", questions: ["Varför har utgifterna förändrats?", "Vilka kategorier driver förändringen?"] },
  { prefix: "/liquidity", questions: ["Varför behöver jag så stor buffert?", "Hur länge räcker pengarna om inkomsten uteblir?"] },
  { prefix: "/calendar", questions: ["Vilken period ser mest ansträngd ut?", "Vilka stora betalningar kommer snart?"] },
  { prefix: "/subscriptions", questions: ["Vilka abonnemang har blivit dyrast?", "Vad kostar våra abonnemang per år?"] },
  { prefix: "/vehicles", questions: ["Vad kostar bilen oss per månad egentligen?", "När är det mest rationellt att byta bil?"] },
  { prefix: "/budget", questions: ["Är budgetförslaget rimligt för oss?", "Var ligger vi mest över budget?"] },
  { prefix: "/savings", questions: ["Hur mycket borde vi spara varje månad?", "Vad är det bästa vi kan göra med överskottet?"] },
  { prefix: "/goals", questions: ["Ligger våra sparmål i fas?"] },
  { prefix: "/debt", questions: ["Lönar det sig att amortera extra?"] },
  { prefix: "/net-worth", questions: ["Hur har vår förmögenhet utvecklats?"] },
  { prefix: "/reports", questions: ["Vad sticker ut i den här rapporten?"] },
  { prefix: "/transactions", questions: ["Finns det ovanliga transaktioner nyligen?"] },
];

const DEFAULT_QUESTIONS = [
  "Hur ligger vi till den här månaden?",
  "Vad borde jag titta på just nu?",
];

function contextForPath(pathname: string): AdvisorPageContext {
  const segments = pathname.split("/").filter(Boolean);
  const page = segments[0] ?? "home";
  const context: AdvisorPageContext = { page };
  if (segments.length >= 2) {
    const entityTypeByPage: Record<string, AdvisorPageContext["entityType"]> = {
      transactions: undefined,
      subscriptions: "subscription",
      vehicles: "vehicle",
      accounts: "account",
      goals: "goal",
    };
    const entityType = entityTypeByPage[page];
    if (entityType) {
      context.entityType = entityType;
      context.entityId = segments[1]!.slice(0, 80);
    }
  }
  return context;
}

function questionsForPath(pathname: string): string[] {
  const match = SUGGESTIONS.find((entry) => pathname.startsWith(entry.prefix));
  return match ? match.questions : DEFAULT_QUESTIONS;
}

type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  citations?: AdvisorChatResponse["citations"];
};

export function AdvisorPanel() {
  const householdId = useHouseholdId();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const flagsQuery = useQuery({
    queryKey: ["feature-flags"],
    queryFn: () => api.getFeatureFlags(),
    staleTime: 5 * 60_000,
  });
  const aiEnabled = flagsQuery.data?.find((f) => f.key === "AI")?.enabled ?? false;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The advisor page has its own full chat; the floating panel would only
  // duplicate it there.
  if (!aiEnabled || pathname.startsWith("/advisor")) return null;

  async function send(message: string) {
    if (!householdId || !message.trim() || busy) return;
    const text = message.trim();
    setInput("");
    setTurns((prev) => [...prev, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await api.advisorChat({
        householdId,
        message: text,
        context: contextForPath(pathname),
      });
      setTurns((prev) => [
        ...prev,
        { role: "assistant", text: res.reply, citations: res.citations },
      ]);
    } catch {
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Rådgivaren kunde inte svara just nu. Dina siffror påverkas inte — försök igen om en stund.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="advisor-panel-trigger"
        className="fixed bottom-20 right-4 z-40 min-h-11 rounded-full bg-accent px-4 text-sm font-medium text-on-accent shadow-lg md:bottom-6 md:right-6"
        aria-haspopup="dialog"
      >
        Fråga rådgivaren
      </button>

      {open ? (
        <div className="fixed inset-0 z-50" role="presentation">
          <button
            type="button"
            aria-label="Stäng rådgivaren"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/30"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="AI-rådgivare"
            data-testid="advisor-panel"
            className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-[20px] bg-surface-elevated shadow-xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[26rem] md:rounded-none"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">Rådgivaren</h2>
                <p className="text-xs text-text-muted">
                  Svar byggs bara från dina egna siffror.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-11 rounded-[10px] px-3 text-sm text-text-muted hover:text-text-primary"
              >
                Stäng
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {turns.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-text-muted">
                    Förslag utifrån sidan du är på:
                  </p>
                  {questionsForPath(pathname).map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => void send(question)}
                      className="block w-full rounded-[12px] border border-border px-3 py-2.5 text-left text-sm hover:border-accent hover:text-accent"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              ) : (
                turns.map((turn, index) => (
                  <div
                    key={`${turn.role}-${index}`}
                    className={
                      turn.role === "user"
                        ? "ml-6 rounded-[12px] bg-accent/10 px-3 py-2 text-sm"
                        : "mr-6 rounded-[12px] border border-border px-3 py-2 text-sm"
                    }
                  >
                    <p className="whitespace-pre-wrap text-text-primary">{turn.text}</p>
                    {turn.citations && turn.citations.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                        {turn.citations.map((citation, ci) => (
                          <li key={`${citation.tool}-${ci}`}>
                            {citation.href ? (
                              <Link
                                href={citation.href}
                                onClick={() => setOpen(false)}
                                className="text-accent hover:underline"
                              >
                                {citation.label}
                              </Link>
                            ) : (
                              <span className="text-text-muted">{citation.label}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))
              )}
              {busy ? <p className="text-xs text-text-muted">Räknar på det…</p> : null}
            </div>

            <div className="border-t border-border px-5 py-3">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void send(input);
                  }}
                  aria-label="Din fråga till rådgivaren"
                  placeholder="Ställ en fråga…"
                  className="min-h-11 flex-1 rounded-[12px] border border-border bg-surface px-3 text-sm"
                />
                <button
                  type="button"
                  disabled={busy || !input.trim()}
                  onClick={() => void send(input)}
                  className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60"
                >
                  Skicka
                </button>
              </div>
              <p className="mt-2 text-[11px] text-text-muted">
                Rådgivaren läser bara — inga ändringar görs utan att du godkänner
                dem själv.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
