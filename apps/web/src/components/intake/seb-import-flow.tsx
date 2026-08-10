"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountDto } from "@ffos/schemas";
import type { StatementImportPreview } from "@ffos/api-client";
import { api } from "@/lib/api";
import { describeError } from "@/lib/error-message";
import { invalidateAfterFinancialImport, queryKeys } from "@/lib/query-keys";
import { MoneyValue } from "../financial/money-value";

/**
 * Importing a SEB account statement.
 *
 * Four steps, and the order matters: choose a file and an account, read what the
 * file actually contains, confirm, then watch it finish. Selecting a file writes
 * nothing financial — the preview comes from parsed and preserved rows, and only
 * the confirmation leads to ledger writes.
 */

type Step = "choose" | "preview" | "importing" | "done";

const CHAIN_LABELS: Record<string, { text: string; tone: string }> = {
  RECONCILED: { text: "Kontoutdraget går ihop", tone: "text-positive" },
  RECONCILED_WITH_WARNINGS: {
    text: "Går ihop, med några avvikelser",
    tone: "text-warning",
  },
  BROKEN: { text: "Saldona går inte ihop", tone: "text-negative" },
  INSUFFICIENT_DATA: { text: "För få saldon för att kontrollera", tone: "text-text-muted" },
};

/** Account types a statement can be imported into. */
const IMPORTABLE = new Set(["CHECKING", "SAVINGS", "CREDIT_CARD", "CASH"]);

function formatPeriod(from: string | null, to: string | null): string {
  if (!from || !to) return "–";
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("sv-SE", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}

export function SebImportFlow({ householdId }: { householdId: string }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState("");
  const [preview, setPreview] = useState<StatementImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ status: string; created: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const accountsQuery = useQuery({
    queryKey: queryKeys.accounts.all(householdId),
    queryFn: () => api.listAccounts(householdId),
  });

  const eligible = (accountsQuery.data?.items ?? []).filter(
    (account: AccountDto) =>
      IMPORTABLE.has(account.accountType) &&
      account.currency === "SEK" &&
      !account.archivedAt,
  );

  // Preselect when there is only one plausible destination; never guess between
  // several, because the file cannot say which account it belongs to.
  useEffect(() => {
    if (!accountId && eligible.length === 1) setAccountId(eligible[0]!.id);
  }, [accountId, eligible]);

  async function readFileAsBase64(selected: File): Promise<string> {
    const buffer = await selected.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function onInspect() {
    if (!file || !accountId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const contentBase64 = await readFileAsBase64(file);
      const inspected = await api.inspectStatementImport({
        householdId,
        accountId,
        filename: file.name,
        contentBase64,
      });
      setPreview(inspected);
      setStep("preview");
    } catch (err) {
      setError(describeError(err, "Kunde inte läsa filen."));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    setStep("importing");
    try {
      await api.commitStatementImport({ householdId, batchId: preview.batchId });
      // The work runs on the worker; the batch's own status is the progress.
      const finished = await pollBatch(preview.batchId);
      setResult({ status: finished.status, created: finished.newRecords });
      // Everything an import touches, refreshed in one place, so no screen is
      // left needing a manual reload.
      await invalidateAfterFinancialImport(queryClient, householdId);
      setStep("done");
    } catch (err) {
      setError(describeError(err, "Importen kunde inte slutföras."));
      setStep("preview");
    } finally {
      setBusy(false);
    }
  }

  async function pollBatch(batchId: string) {
    const deadline = Date.now() + 15 * 60_000;
    let delay = 700;
    for (;;) {
      const batch = await api.getImportBatch(householdId, batchId);
      if (
        batch.status === "COMPLETED" ||
        batch.status === "COMPLETED_WITH_WARNINGS" ||
        batch.status === "FAILED"
      ) {
        return batch;
      }
      if (Date.now() > deadline) return batch;
      await new Promise((resolve) => setTimeout(resolve, delay));
      // Back off gently: a five-year statement takes a while, and polling every
      // 700ms for minutes is needless load.
      delay = Math.min(delay * 1.3, 4_000);
    }
  }

  function reset() {
    setStep("choose");
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /* ------------------------------------------------------------- choosing */

  if (step === "choose") {
    return (
      <section className="space-y-4 rounded-[16px] bg-surface-elevated p-5">
        <div>
          <h2 className="text-sm font-medium text-text-secondary">
            Importera kontoutdrag från SEB
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            Ladda upp CSV-filen du hämtar under Kontoutdrag i SEB:s internetbank.
            Inget bokförs förrän du har granskat innehållet.
          </p>
        </div>

        {/*
          A native file input renders the browser's own control, and its label is
          the browser's language: "Choose File / No file chosen" in an otherwise
          Swedish product, with no attribute able to change it. The input is kept
          for behaviour and assistive technology, positioned off-screen rather than
          `display: none` so it stays focusable, and the visible trigger is ours.
        */}
        <div className="block text-sm">
          <span className="text-text-muted">Fil</span>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              ref={fileInputRef}
              id="seb-csv-file"
              type="file"
              accept=".csv,text/csv"
              aria-label="Välj CSV-fil från SEB"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError(null);
              }}
              className="sr-only"
            />
            <label
              htmlFor="seb-csv-file"
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[12px] border border-border-strong px-4 text-sm text-text-primary focus-within:outline focus-within:outline-2 focus-within:outline-accent"
            >
              Välj fil…
            </label>
            <span
              className={`min-w-0 truncate text-sm ${file ? "text-text-primary" : "text-text-muted"}`}
            >
              {file ? file.name : "Ingen fil vald än"}
            </span>
          </div>
        </div>

        <label className="block text-sm">
          <span className="text-text-muted">Konto</span>
          <select
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            aria-label="Konto att importera till"
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-text-primary"
          >
            <option value="">Välj konto…</option>
            {eligible.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-text-muted">
            Filen innehåller inte tillräcklig kontoinformation för att välja åt
            dig. Saknas kontot?{" "}
            <a href="/accounts" className="text-accent underline">
              Skapa ett SEB-konto först
            </a>
            .
          </span>
        </label>

        {eligible.length === 0 && !accountsQuery.isLoading ? (
          <p className="text-xs text-warning">
            Det finns inget aktivt SEK-konto att importera till.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={!file || !accountId || busy}
          onClick={() => void onInspect()}
          className="min-h-11 w-full rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60 sm:w-auto"
        >
          {busy ? "Läser filen…" : "Granska innehållet"}
        </button>
      </section>
    );
  }

  /* -------------------------------------------------------------- preview */

  if (step === "preview" && preview) {
    const chain = CHAIN_LABELS[preview.balanceChain.status] ?? {
      text: preview.balanceChain.status,
      tone: "text-text-muted",
    };
    return (
      <section className="space-y-5 rounded-[16px] bg-surface-elevated p-5">
        <div>
          <h2 className="text-sm font-medium text-text-secondary">SEB kontoutdrag</h2>
          <p className="mt-1 text-xs text-text-muted">
            Granska innan något bokförs.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-text-muted">Fil</dt>
            <dd className="mt-0.5 break-all">{preview.fileName}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Konto</dt>
            <dd className="mt-0.5">{preview.accountName}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Period</dt>
            <dd className="mt-0.5">
              {formatPeriod(preview.periodStart, preview.periodEnd)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Rader</dt>
            <dd className="mt-0.5 tabular-nums">
              {preview.totalRows.toLocaleString("sv-SE")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Nya</dt>
            <dd className="mt-0.5 tabular-nums font-medium">
              {preview.newRows.toLocaleString("sv-SE")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Redan importerade</dt>
            <dd className="mt-0.5 tabular-nums">
              {preview.existingRows.toLocaleString("sv-SE")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Ogiltiga</dt>
            <dd
              className={`mt-0.5 tabular-nums ${preview.invalidRows > 0 ? "text-warning" : ""}`}
            >
              {preview.invalidRows.toLocaleString("sv-SE")}
            </dd>
          </div>
          {preview.closingBalanceMinor ? (
            <div>
              <dt className="text-xs text-text-muted">Saldo</dt>
              <dd className="mt-0.5">
                <MoneyValue
                  value={{
                    amountMinor: preview.closingBalanceMinor,
                    currency: preview.currency as "SEK",
                  }}
                />
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-text-muted">Saldokontroll</dt>
            <dd className={`mt-0.5 ${chain.tone}`}>{chain.text}</dd>
          </div>
        </dl>

        {preview.balanceChain.breakCount > 0 ? (
          <div className="rounded-[12px] border border-border bg-surface p-3 text-xs">
            <p className="font-medium text-warning">
              {preview.balanceChain.breakCount} rad
              {preview.balanceChain.breakCount === 1 ? "" : "er"} där saldot inte
              stämmer med föregående rad.
            </p>
            <ul className="mt-2 space-y-1 text-text-secondary">
              {preview.balanceChain.breaks.slice(0, 5).map((brk) => (
                <li key={brk.rowNumber} className="tabular-nums">
                  Rad {brk.rowNumber} ({brk.bookingDate}): väntat{" "}
                  <MoneyValue
                    value={{
                      amountMinor: brk.expectedBalanceMinor,
                      currency: preview.currency as "SEK",
                    }}
                  />
                  , utdraget säger{" "}
                  <MoneyValue
                    value={{
                      amountMinor: brk.reportedBalanceMinor,
                      currency: preview.currency as "SEK",
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {preview.invalidSample.length > 0 ? (
          <div className="rounded-[12px] border border-border bg-surface p-3 text-xs">
            <p className="font-medium text-warning">Rader som inte kan importeras</p>
            <ul className="mt-2 space-y-1 text-text-secondary">
              {preview.invalidSample.slice(0, 5).map((row) => (
                <li key={row.rowNumber}>
                  Rad {row.rowNumber}: {row.detail}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-xs text-text-muted">
            Ett urval av de senaste raderna
            {preview.totalRows > preview.sample.length
              ? ` (${preview.sample.length} av ${preview.totalRows.toLocaleString("sv-SE")})`
              : ""}
          </p>

          {/* Desktop: a table. Mobile: a list, never a squeezed table. */}
          <div className="hidden overflow-hidden rounded-[12px] border border-border sm:block">
            <table className="w-full text-sm">
              <thead className="bg-surface text-xs text-text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Datum</th>
                  <th className="px-3 py-2 text-left font-medium">Text</th>
                  <th className="px-3 py-2 text-right font-medium">Belopp</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((row) => (
                  <tr key={row.rowNumber} className="border-t border-border">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {row.bookingDate}
                    </td>
                    <td className="max-w-[22rem] truncate px-3 py-2">{row.text}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {row.amountMinor ? (
                        <MoneyValue
                          value={{
                            amountMinor: row.amountMinor,
                            currency: preview.currency as "SEK",
                          }}
                          signed
                        />
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-text-secondary">
                      {row.reportedBalanceMinor ? (
                        <MoneyValue
                          value={{
                            amountMinor: row.reportedBalanceMinor,
                            currency: preview.currency as "SEK",
                          }}
                        />
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-text-muted">
                      {row.status === "NEW" ? "Ny" : "Redan importerad"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-2 sm:hidden">
            {preview.sample.map((row) => (
              <li
                key={row.rowNumber}
                className="rounded-[12px] border border-border bg-surface p-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm">{row.text}</span>
                  {row.amountMinor ? (
                    <MoneyValue
                      value={{
                        amountMinor: row.amountMinor,
                        currency: preview.currency as "SEK",
                      }}
                      signed
                      className="shrink-0 text-sm font-medium"
                    />
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-text-muted tabular-nums">
                  {row.bookingDate} ·{" "}
                  {row.status === "NEW" ? "Ny" : "Redan importerad"}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={busy || preview.newRows === 0}
            onClick={() => void onConfirm()}
            className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60"
          >
            {preview.newRows === 0
              ? "Inget nytt att importera"
              : `Importera ${preview.newRows.toLocaleString("sv-SE")} transaktioner`}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={reset}
            className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm disabled:opacity-60"
          >
            Avbryt
          </button>
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------------ importing */

  if (step === "importing") {
    return (
      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm font-medium text-text-secondary">Importerar…</h2>
        <p className="text-xs text-text-muted">
          {preview
            ? `${preview.newRows.toLocaleString("sv-SE")} transaktioner bokförs. Ett långt kontoutdrag kan ta en stund — du kan lämna sidan och komma tillbaka.`
            : "Bokför transaktioner."}
        </p>
        <div
          role="progressbar"
          aria-label="Importerar kontoutdrag"
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface"
        >
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
        </div>
      </section>
    );
  }

  /* ----------------------------------------------------------------- done */

  return (
    <section className="space-y-4 rounded-[16px] bg-surface-elevated p-5">
      <div>
        <h2 className="text-sm font-medium text-text-secondary">
          {result?.status === "FAILED" ? "Importen misslyckades" : "Importen är klar"}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {result?.status === "FAILED"
            ? "Inga transaktioner kunde bokföras. Kontrollera importen i historiken nedan."
            : `${(result?.created ?? 0).toLocaleString("sv-SE")} transaktioner bokförda på ${preview?.accountName ?? "kontot"}.`}
        </p>
        {result?.status === "COMPLETED_WITH_WARNINGS" ? (
          <p className="mt-2 text-xs text-warning">
            Några rader behöver granskas. Se importen i historiken nedan och under
            Granska.
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href="/transactions"
          className="flex min-h-11 items-center justify-center rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent"
        >
          Visa transaktioner
        </a>
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm"
        >
          Importera en till fil
        </button>
      </div>
    </section>
  );
}
