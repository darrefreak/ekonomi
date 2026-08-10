"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  AccountsResponse,
  DocumentDetailDto,
  DocumentsResponse,
  UpdateDocumentInput,
  VehiclesResponse,
} from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { MoneyValue } from "../financial/money-value";
import { EmptyState } from "../feedback/empty-state";
import { ErrorState } from "../feedback/error-state";
import { LoadingState } from "../feedback/loading-state";
import { describeError } from "@/lib/error-message";

const DOC_TYPES = [
  "INVOICE",
  "INSURANCE",
  "TAX",
  "SALARY",
  "VEHICLE",
  "RECEIPT",
  "CONTRACT",
  "OTHER",
] as const;

export function DocumentsPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [data, setData] = useState<DocumentsResponse | null>(null);
  const [accounts, setAccounts] = useState<AccountsResponse | null>(null);
  const [vehicles, setVehicles] = useState<VehiclesResponse | null>(null);
  const [selected, setSelected] = useState<DocumentDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("Uppladdat dokument");
  const [docType, setDocType] =
    useState<(typeof DOC_TYPES)[number]>("INVOICE");
  const [file, setFile] = useState<File | null>(null);
  const [linkVehicleId, setLinkVehicleId] = useState("");
  const [linkAccountId, setLinkAccountId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const id = await ensureHouseholdSession();
      setHouseholdId(id);
      const [docs, accs, vehs] = await Promise.all([
        api.getDocuments(id),
        api.listAccounts(id),
        api.listVehicles(id),
      ]);
      setData(docs);
      setAccounts(accs);
      setVehicles(vehs);
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

  async function openDetail(documentId: string) {
    if (!householdId) return;
    setBusy(true);
    try {
      setSelected(await api.getDocument(householdId, documentId));
    } finally {
      setBusy(false);
    }
  }

  async function onUpload() {
    if (!householdId || !file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]!);
      }
      const contentBase64 = btoa(binary);
      const created = await api.uploadDocument({
        householdId,
        title: title.trim() || file.name,
        documentType: docType,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        contentBase64,
        vehicleId: linkVehicleId || null,
        accountId: linkAccountId || null,
      });
      setFile(null);
      await load();
      setSelected(created);
    } catch (err) {
      setError(describeError(err, "Uppladdning misslyckades"));
    } finally {
      setBusy(false);
    }
  }

  async function patchSelected(
    patch: Omit<UpdateDocumentInput, "householdId">,
  ) {
    if (!householdId || !selected) return;
    setBusy(true);
    try {
      const next = await api.updateDocument(selected.id, {
        ...patch,
        householdId,
      });
      setSelected(next);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function reextract() {
    if (!householdId || !selected) return;
    setBusy(true);
    try {
      setSelected(await api.reextractDocument(householdId, selected.id));
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Hämtar dokument…" />;
  if (error && !data) {
    return (
      <ErrorState
        title="Kunde inte hämta dokument"
        description={error}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Dokument / inbox
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Uppladdning via object storage · mock extraction · statusflöde ·{" "}
          {data?.asOf}
        </p>
      </div>

      <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Ladda upp</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-text-secondary">Titel</span>
            <input
              className="mt-1 w-full min-h-11 rounded-[12px] border border-border bg-surface px-3"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-secondary">Typ</span>
            <select
              className="mt-1 w-full min-h-11 rounded-[12px] border border-border bg-surface px-3"
              value={docType}
              onChange={(e) =>
                setDocType(e.target.value as (typeof DOC_TYPES)[number])
              }
            >
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-text-secondary">Fordon (valfritt)</span>
            <select
              className="mt-1 w-full min-h-11 rounded-[12px] border border-border bg-surface px-3"
              value={linkVehicleId}
              onChange={(e) => setLinkVehicleId(e.target.value)}
            >
              <option value="">—</option>
              {(vehicles?.items ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-text-secondary">Konto (valfritt)</span>
            <select
              className="mt-1 w-full min-h-11 rounded-[12px] border border-border bg-surface px-3"
              value={linkAccountId}
              onChange={(e) => setLinkAccountId(e.target.value)}
            >
              <option value="">—</option>
              {(accounts?.items ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <input
          type="file"
          aria-label="Välj fil att ladda upp"
          className="block w-full text-sm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          disabled={!file || busy}
          onClick={() => void onUpload()}
          className="min-h-11 px-4 text-accent disabled:opacity-40"
        >
          Ladda upp + mock-extrahera
        </button>
      </section>

      {!data?.items.length ? (
        <EmptyState
          title="Inga dokument"
          description="Ladda upp ett dokument för att starta inbox-flödet."
        />
      ) : (
        <ul className="space-y-3">
          {data.items.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => void openDetail(d.id)}
                className="w-full rounded-[16px] bg-surface-elevated p-5 text-left"
              >
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-medium">{d.title}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {d.status} · {d.documentType} ·{" "}
                      {d.issuer ?? "okänd utställare"}
                      {d.vehicleId ? " · fordon länkat" : ""}
                      {d.accountId ? " · konto länkat" : ""}
                    </p>
                    {d.notes ? (
                      <p className="mt-2 text-sm text-text-secondary">{d.notes}</p>
                    ) : null}
                  </div>
                  {d.amount ? <MoneyValue value={d.amount} /> : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <section className="space-y-4 rounded-[16px] bg-surface-elevated p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-medium">{selected.title}</h2>
              <p className="mt-1 text-xs text-text-muted">
                {selected.status} · {selected.documentType}
                {selected.originalFilename
                  ? ` · ${selected.originalFilename}`
                  : ""}
              </p>
            </div>
            {selected.amount ? <MoneyValue value={selected.amount} /> : null}
          </div>

          <div>
            <h3 className="text-sm text-text-secondary">Mock extract</h3>
            <pre className="mt-2 overflow-x-auto text-xs text-text-muted">
              {JSON.stringify(selected.extracted ?? {}, null, 2)}
            </pre>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              disabled={busy}
              onClick={() => void patchSelected({ status: "REVIEW" })}
              className="min-h-11 px-3 text-accent disabled:opacity-40"
            >
              Markera REVIEW
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void patchSelected({ status: "ACTION_REQUIRED" })}
              className="min-h-11 px-3 text-accent disabled:opacity-40"
            >
              ACTION_REQUIRED
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void patchSelected({ status: "ARCHIVED" })}
              className="min-h-11 px-3 text-accent disabled:opacity-40"
            >
              Arkivera
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void reextract()}
              className="min-h-11 px-3 text-accent disabled:opacity-40"
            >
              Kör mock extract igen
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="text-text-secondary">Länka fordon</span>
              <select
                className="mt-1 w-full min-h-11 rounded-[12px] border border-border bg-surface px-3"
                value={selected.vehicleId ?? ""}
                onChange={(e) =>
                  void patchSelected({ vehicleId: e.target.value || null })
                }
              >
                <option value="">—</option>
                {(vehicles?.items ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-text-secondary">Länka konto</span>
              <select
                className="mt-1 w-full min-h-11 rounded-[12px] border border-border bg-surface px-3"
                value={selected.accountId ?? ""}
                onChange={(e) =>
                  void patchSelected({ accountId: e.target.value || null })
                }
              >
                <option value="">—</option>
                {(accounts?.items ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selected.vehicleId ? (
            <p className="text-sm">
              <Link
                href={`/vehicles/${selected.vehicleId}`}
                className="text-accent hover:underline"
              >
                Öppna fordon →
              </Link>
            </p>
          ) : null}
          {selected.accountId ? (
            <p className="text-sm">
              <Link
                href={`/accounts/${selected.accountId}`}
                className="text-accent hover:underline"
              >
                Öppna konto →
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
