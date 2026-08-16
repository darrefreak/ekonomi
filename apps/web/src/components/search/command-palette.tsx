"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";

const OPEN_EVENT = "ffos:open-search";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Quick actions: navigation verbs, matched on plain words. Shown before
 * search results, and on an empty query, so Cmd+K is a way to *do* things,
 * not only to find them.
 */
const ACTIONS: Array<{ label: string; href: string; keywords: string }> = [
  { label: "Öppna kalendern", href: "/calendar", keywords: "kalender kommande betalningar calendar" },
  { label: "Vad har förändrats?", href: "/what-changed", keywords: "förändrats jämför ändrats changed" },
  { label: "Öppna smart budget", href: "/budget", keywords: "budget smart planera" },
  { label: "Lägg till transaktion", href: "/transactions", keywords: "ny transaktion lägg till add" },
  { label: "Importera kontoutdrag", href: "/imports", keywords: "import kontoutdrag csv seb analys" },
  { label: "Granska mönster", href: "/review", keywords: "granska review behöver hjälp" },
  { label: "Skapa mål", href: "/goals", keywords: "mål sparmål goal skapa" },
  { label: "Kör scenario", href: "/scenarios", keywords: "scenario simulera vad händer om" },
  { label: "Öppna rapporter", href: "/reports", keywords: "rapport rapporter utforska report" },
  { label: "Sparande & överskott", href: "/savings", keywords: "spara sparande överskott" },
  { label: "Likviditet", href: "/liquidity", keywords: "likviditet buffert kassa" },
];

function matchActions(query: string) {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return ACTIONS.slice(0, 6);
  return ACTIONS.filter(
    (action) =>
      action.label.toLowerCase().includes(q) || action.keywords.includes(q),
  ).slice(0, 5);
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const runSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setData(null);
      return;
    }
    setBusy(true);
    try {
      const householdId = await ensureHouseholdSession();
      setData(await api.search(householdId, query.trim()));
    } catch {
      setData(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void runSearch(q), 200);
    return () => clearTimeout(t);
  }, [q, open, runSearch]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Global sök"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-[16px] bg-surface-elevated shadow-[var(--ffos-shadow-soft)]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Sök i appen"
          placeholder="Sök transaktioner, konton, dokument…"
          className="min-h-12 w-full border-b border-border bg-transparent px-4 text-sm outline-none"
        />
        <ul className="max-h-80 overflow-y-auto py-2">
          {matchActions(q).map((action) => (
            <li key={action.href}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-2 px-4 text-left hover:bg-surface"
                onClick={() => {
                  setOpen(false);
                  setQ("");
                  router.push(action.href);
                }}
              >
                <span aria-hidden className="text-xs text-text-muted">
                  →
                </span>
                <span className="text-sm">{action.label}</span>
              </button>
            </li>
          ))}
          {busy ? (
            <li className="px-4 py-3 text-sm text-text-muted">Söker…</li>
          ) : null}
          {!busy && data?.results.length === 0 && matchActions(q).length === 0 ? (
            <li className="px-4 py-3 text-sm text-text-muted">Inga träffar</li>
          ) : null}
          {data?.results.map((r) => (
            <li key={`${r.type}-${r.id}`}>
              <button
                type="button"
                className="flex min-h-12 w-full flex-col justify-center px-4 text-left hover:bg-surface"
                onClick={() => {
                  setOpen(false);
                  setQ("");
                  router.push(r.href);
                }}
              >
                <span className="text-sm font-medium">{r.title}</span>
                <span className="text-xs text-text-muted">
                  {r.type}
                  {r.subtitle ? ` · ${r.subtitle}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SearchTriggerButton({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      className={`min-h-11 rounded-[12px] border border-border px-3 text-sm text-text-muted ${
        compact ? "inline-flex items-center md:hidden" : "hidden items-center md:inline-flex"
      }`}
      onClick={() => openCommandPalette()}
    >
      {compact ? "Sök" : "Sök ⌘K"}
    </button>
  );
}
