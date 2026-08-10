"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ImportHistoryItem } from "@ffos/api-client";
import { api } from "@/lib/api";
import { describeError } from "@/lib/error-message";
import { getHouseholdId } from "@/lib/session";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { MoneyValue } from "../financial/money-value";
import { SebImportFlow } from "./seb-import-flow";

/**
 * Imports: bring a bank statement in, and see what previous imports did.
 *
 * This page used to list mock sync batches in developer language — "records",
 * "created", "ignored". It is now the real import surface.
 */

const STATUS_LABELS: Record<string, { text: string; tone: string }> = {
  UPLOADED: { text: "Uppladdad", tone: "text-text-muted" },
  INSPECTING: { text: "Läser filen", tone: "text-text-muted" },
  READY_FOR_REVIEW: { text: "Väntar på bekräftelse", tone: "text-warning" },
  IMPORTING: { text: "Importerar", tone: "text-text-secondary" },
  COMPLETED: { text: "Klar", tone: "text-positive" },
  COMPLETED_WITH_WARNINGS: { text: "Klar med anmärkningar", tone: "text-warning" },
  FAILED: { text: "Misslyckades", tone: "text-negative" },
  RUNNING: { text: "Pågår", tone: "text-text-secondary" },
  PARTIAL: { text: "Delvis klar", tone: "text-warning" },
};

const CHAIN_LABELS: Record<string, string> = {
  RECONCILED: "Saldona går ihop",
  RECONCILED_WITH_WARNINGS: "Går ihop med avvikelser",
  BROKEN: "Saldona går inte ihop",
  INSUFFICIENT_DATA: "För få saldon att kontrollera",
};

function formatDay(value: string | null): string {
  if (!value) return "–";
  return new Date(value).toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ImportRow({ item }: { item: ImportHistoryItem }) {
  const [open, setOpen] = useState(false);
  const householdId = getHouseholdId();
  const status = STATUS_LABELS[item.status] ?? {
    text: item.status,
    tone: "text-text-muted",
  };

  const detail = useQuery({
    queryKey: ["imports", householdId, "batch", item.id],
    queryFn: () => api.getImportBatch(householdId!, item.id),
    enabled: open && Boolean(householdId),
  });

  return (
    <li className="rounded-[16px] bg-surface-elevated p-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">
            {item.provider ?? "Okänd källa"}
            {item.accountName ? ` · ${item.accountName}` : ""}
          </span>
          <span className="mt-0.5 block truncate text-xs text-text-muted">
            {item.fileName ?? "—"} · {formatDay(item.startedAt)}
          </span>
        </span>
        <span className={`shrink-0 text-xs ${status.tone}`}>{status.text}</span>
      </button>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-text-muted">Period</dt>
          <dd className="mt-0.5">
            {item.periodStart && item.periodEnd
              ? `${formatDay(item.periodStart)} – ${formatDay(item.periodEnd)}`
              : "–"}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Rader</dt>
          <dd className="mt-0.5 tabular-nums">
            {item.totalRecords.toLocaleString("sv-SE")}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Nya</dt>
          <dd className="mt-0.5 tabular-nums">
            {item.newRecords.toLocaleString("sv-SE")}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Redan importerade</dt>
          <dd className="mt-0.5 tabular-nums">
            {item.existingRecords.toLocaleString("sv-SE")}
          </dd>
        </div>
      </dl>

      {item.invalidRecords > 0 || item.reviewRecords > 0 || item.failedCount > 0 ? (
        <p className="mt-2 text-xs text-warning">
          {[
            item.invalidRecords > 0 ? `${item.invalidRecords} ogiltiga` : null,
            item.reviewRecords > 0 ? `${item.reviewRecords} behöver granskas` : null,
            item.failedCount > 0 ? `${item.failedCount} misslyckade` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}

      {item.balanceChainStatus ? (
        <p className="mt-2 text-xs text-text-secondary">
          {CHAIN_LABELS[item.balanceChainStatus] ?? item.balanceChainStatus}
          {item.closingBalanceMinor ? (
            <>
              {" · Utgående saldo "}
              <MoneyValue
                value={{ amountMinor: item.closingBalanceMinor, currency: "SEK" }}
              />
            </>
          ) : null}
        </p>
      ) : null}

      {open ? (
        <div className="mt-3 border-t border-border pt-3 text-xs">
          {detail.isLoading ? (
            <p className="text-text-muted">Hämtar detaljer…</p>
          ) : detail.isError ? (
            <p className="text-negative">
              {describeError(detail.error, "Kunde inte hämta importen.")}
            </p>
          ) : detail.data ? (
            <div className="space-y-2">
              <p className="text-text-secondary">
                Format {detail.data.format} · filsumma{" "}
                <span className="font-mono">
                  {detail.data.fileHash?.slice(0, 12) ?? "–"}
                </span>
              </p>
              {detail.data.invalidRows.length > 0 ? (
                <div>
                  <p className="font-medium text-warning">Rader som inte importerades</p>
                  <ul className="mt-1 space-y-1 text-text-secondary">
                    {detail.data.invalidRows.slice(0, 10).map((row) => (
                      <li key={`${row.rowNumber}`}>
                        Rad {row.rowNumber}: {row.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-text-muted">Alla rader kunde tolkas.</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function ImportsPage() {
  const householdId = getHouseholdId();
  const history = useQuery({
    queryKey: ["imports", householdId, "history"],
    queryFn: () => api.getImportHistory(householdId!),
    enabled: Boolean(householdId),
  });

  if (!householdId) return <LoadingState label="Hämtar hushåll…" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Importer
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Hämta in kontoutdrag från banken.{" "}
          <Link href="/integrations" className="text-accent underline">
            Hantera kopplingar
          </Link>
        </p>
      </div>

      <SebImportFlow householdId={householdId} />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-text-secondary">Tidigare importer</h2>
        {history.isLoading ? (
          <LoadingState label="Hämtar importhistorik…" />
        ) : history.isError ? (
          <ErrorState
            title="Kunde inte hämta importhistoriken"
            description={describeError(history.error, "Försök igen om en stund.")}
          />
        ) : (history.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title="Inga importer ännu"
            description="När du har importerat ett kontoutdrag hamnar det här, med period, antal rader och saldokontroll."
          />
        ) : (
          <ul className="space-y-3">
            {history.data!.items.map((item) => (
              <ImportRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
