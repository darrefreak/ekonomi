"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CategoriesResponse } from "@ffos/schemas";
import { api } from "@/lib/api";
import { kronorToMinorString, minorToKronorInput } from "@/lib/money-input";
import { queryKeys } from "@/lib/query-keys";
import { describeError } from "@/lib/error-message";

type SplitRow = {
  key: string;
  categoryId: string;
  memo: string;
  amountKr: string;
};

function newRow(): SplitRow {
  return { key: Math.random().toString(36).slice(2), categoryId: "", memo: "", amountKr: "" };
}

export function SplitEditor({
  householdId,
  financialEventId,
  sourceAmountMinor,
  categories,
  onSaved,
}: {
  householdId: string;
  financialEventId: string;
  /** Absolute value of the economic event amount (always positive minor string). */
  sourceAmountMinor: string;
  categories: CategoriesResponse["items"];
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"category" | "mortgage">("category");
  const [rows, setRows] = useState<SplitRow[]>([newRow(), newRow()]);
  const [principalKr, setPrincipalKr] = useState("");
  const [interestKr, setInterestKr] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const totalMinor: string | null =
    mode === "mortgage"
      ? (() => {
          const p = kronorToMinorString(principalKr || "0");
          const i = kronorToMinorString(interestKr || "0");
          if (p == null || i == null) return null;
          return (BigInt(p) + BigInt(i)).toString();
        })()
      : (() => {
          let sum = 0n;
          for (const row of rows) {
            const minor = kronorToMinorString(row.amountKr || "0");
            if (minor == null) return null;
            sum += BigInt(minor);
          }
          return sum.toString();
        })();

  const remainingMinor =
    totalMinor == null ? null : BigInt(sourceAmountMinor) - BigInt(totalMinor);
  const balanced = remainingMinor === 0n;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (totalMinor == null || remainingMinor == null) {
        throw new Error("Ange giltiga belopp i kronor för alla rader.");
      }
      if (!balanced) {
        throw new Error(
          `Delningen måste summera exakt till beloppet. Kvar att fördela: ${minorToKronorInput(remainingMinor.toString())} kr.`,
        );
      }
      const splits =
        mode === "mortgage"
          ? [
              {
                amountMinor: kronorToMinorString(principalKr || "0")!,
                memo: "Amortering",
              },
              {
                amountMinor: kronorToMinorString(interestKr || "0")!,
                memo: "Ränta",
              },
            ]
          : rows
              .filter((r) => r.amountKr.trim())
              .map((r) => ({
                categoryId: r.categoryId || undefined,
                amountMinor: kronorToMinorString(r.amountKr)!,
                memo: r.memo.trim() || undefined,
              }));
      if (splits.length === 0) {
        throw new Error("Lägg till minst en delning.");
      }
      return api.replaceEventSplits(financialEventId, {
        householdId,
        sourceAmountMinor,
        splits,
      });
    },
    onSuccess: async () => {
      setFormError(null);
      setSavedMsg("Delningen sparad.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions", householdId] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all(householdId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.budget.all(householdId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.metrics.all(householdId) }),
      ]);
      onSaved?.();
    },
    onError: (err: unknown) => {
      setSavedMsg(null);
      setFormError(describeError(err, "Kunde inte spara delningen."));
    },
  });

  return (
    <div className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
      <h2 className="text-sm font-medium text-text-secondary">
        Dela upp beloppet
      </h2>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("category")}
          className={`min-h-11 rounded-[12px] px-4 text-sm font-medium ${
            mode === "category"
              ? "bg-accent text-on-accent"
              : "border border-border bg-surface text-text-secondary"
          }`}
        >
          Kategorisplit
        </button>
        <button
          type="button"
          onClick={() => setMode("mortgage")}
          className={`min-h-11 rounded-[12px] px-4 text-sm font-medium ${
            mode === "mortgage"
              ? "bg-accent text-on-accent"
              : "border border-border bg-surface text-text-secondary"
          }`}
        >
          Bolån (ränta/amortering)
        </button>
      </div>

      {mode === "category" ? (
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <div key={row.key} className="grid gap-2 md:grid-cols-[1fr_1fr_7rem_auto]">
              <select
                value={row.categoryId}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.key === row.key ? { ...r, categoryId: e.target.value } : r)),
                  )
                }
                className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm"
              >
                <option value="">Ingen kategori</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                value={row.memo}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.key === row.key ? { ...r, memo: e.target.value } : r)),
                  )
                }
                placeholder="Anteckning (valfritt)"
                className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm"
              />
              <input
                inputMode="decimal"
                value={row.amountKr}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.key === row.key ? { ...r, amountKr: e.target.value } : r)),
                  )
                }
                placeholder="0"
                className="min-h-11 rounded-[12px] border border-border bg-surface px-3 text-sm tabular-nums"
              />
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                disabled={rows.length <= 1}
                className="min-h-11 rounded-[12px] border border-border-strong px-3 text-sm disabled:opacity-40"
                aria-label={`Ta bort rad ${idx + 1}`}
              >
                Ta bort
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, newRow()])}
            className="min-h-11 rounded-[12px] border border-border-strong px-4 text-sm"
          >
            + Lägg till rad
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-text-muted">Amortering (kr)</span>
            <input
              inputMode="decimal"
              value={principalKr}
              onChange={(e) => setPrincipalKr(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm tabular-nums"
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Ränta (kr)</span>
            <input
              inputMode="decimal"
              value={interestKr}
              onChange={(e) => setInterestKr(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm tabular-nums"
            />
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-surface px-4 py-3 text-sm">
        <span className="text-text-secondary">
          Totalt: {minorToKronorInput(sourceAmountMinor)} kr
        </span>
        <span className={balanced ? "text-positive" : "text-warning"}>
          Kvar att fördela:{" "}
          {remainingMinor == null ? "?" : minorToKronorInput(remainingMinor.toString())} kr
        </span>
      </div>

      {formError ? (
        <p className="text-sm text-negative" role="alert">
          {formError}
        </p>
      ) : null}
      {savedMsg ? (
        <p className="text-sm text-positive" role="status">
          {savedMsg}
        </p>
      ) : null}

      <button
        type="button"
        disabled={saveMutation.isPending || !balanced}
        onClick={() => void saveMutation.mutate()}
        className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60"
      >
        {saveMutation.isPending ? "Sparar…" : "Spara delning"}
      </button>
    </div>
  );
}
