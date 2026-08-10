"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { VehicleDetailDto } from "@ffos/schemas";
import { api } from "@/lib/api";
import { ensureHouseholdSession } from "@/lib/session";
import { kronorToMinorString, minorToKronorInput } from "@/lib/money-input";
import { queryKeys } from "@/lib/query-keys";
import { describeError } from "@/lib/error-message";

const CASH_LIKE = new Set(["CHECKING", "SAVINGS", "CASH"]);
const LOAN_LIKE = new Set(["LOAN", "MORTGAGE"]);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function VehiclePurchaseForm({
  vehicle,
}: {
  vehicle: VehicleDetailDto;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"cash" | "financed">(
    vehicle.ownershipType === "FINANCED" || vehicle.linkedLoanAccountId
      ? "financed"
      : "cash",
  );
  const [cashAccountId, setCashAccountId] = useState("");
  const [loanAccountId, setLoanAccountId] = useState(
    vehicle.linkedLoanAccountId ?? "",
  );
  const [priceKr, setPriceKr] = useState(
    vehicle.purchasePrice
      ? minorToKronorInput(vehicle.purchasePrice.amountMinor)
      : "",
  );
  const [downKr, setDownKr] = useState("");
  const [occurredOn, setOccurredOn] = useState(
    vehicle.purchaseDate ?? todayIso(),
  );
  const [description, setDescription] = useState(`Köp ${vehicle.name}`);
  const [formError, setFormError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["accounts", "purchase", vehicle.id],
    queryFn: async () => {
      const id = await ensureHouseholdSession();
      return api.listAccounts(id);
    },
  });

  const accounts = accountsQuery.data?.items ?? [];
  const cashAccounts = accounts.filter((a) => CASH_LIKE.has(a.accountType));
  const loanAccounts = accounts.filter((a) => LOAN_LIKE.has(a.accountType));
  const assetAccountId = vehicle.linkedAssetAccountId;

  const mutation = useMutation({
    mutationFn: async () => {
      const householdId = await ensureHouseholdSession();
      if (!assetAccountId) {
        throw new Error("Fordonet saknar länkat tillgångskonto");
      }
      const cashId = cashAccountId || cashAccounts[0]?.id;
      if (!cashId) throw new Error("Välj ett kontantkonto");
      const priceMinor = kronorToMinorString(priceKr);
      if (priceMinor == null || BigInt(priceMinor) <= 0n) {
        throw new Error("Ange ett positivt köpebelopp");
      }
      if (mode === "cash") {
        return api.createAssetPurchase({
          householdId,
          cashAccountId: cashId,
          assetAccountId,
          amountMinor: priceMinor,
          occurredOn,
          description: description || undefined,
          vehicleId: vehicle.id,
        });
      }
      const loanId = loanAccountId || loanAccounts[0]?.id;
      if (!loanId) throw new Error("Välj ett lånekonto");
      const downMinor = kronorToMinorString(downKr || "0");
      if (downMinor == null) throw new Error("Ogiltig kontantinsats");
      return api.createFinancedAssetPurchase({
        householdId,
        cashAccountId: cashId,
        assetAccountId,
        loanAccountId: loanId,
        purchasePriceMinor: priceMinor,
        downPaymentMinor: downMinor,
        occurredOn,
        description: description || undefined,
        vehicleId: vehicle.id,
      });
    },
    onSuccess: async (result) => {
      setFormError(null);
      setOkMsg(`Ledger-händelse sparad (${result.id.slice(0, 8)}…)`);
      const householdId = await ensureHouseholdSession();
      await queryClient.invalidateQueries({
        queryKey: queryKeys.accounts.all(householdId),
      });
    },
    onError: (err: unknown) => {
      setOkMsg(null);
      setFormError(describeError(err, "Kunde inte spara köp"));
    },
  });

  if (!assetAccountId) {
    return (
      <section className="rounded-[16px] bg-surface-elevated p-5">
        <h2 className="text-sm text-text-secondary">Registrera köp i ledger</h2>
        <p className="mt-2 text-sm text-text-muted">
          Fordonet saknar länkat tillgångskonto — koppla ett ASSET-konto innan
          köp kan bokföras.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-[16px] bg-surface-elevated p-5">
      <div>
        <h2 className="text-sm text-text-secondary">Registrera köp i ledger</h2>
        <p className="mt-1 text-xs text-text-muted">
          Skapar en balanserad ledger-händelse (kontant eller finansierat).
          Demo-fordonet är redan bokfört — använd formuläret för nya fordon
          eller tester.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`min-h-11 rounded-[12px] px-4 text-sm ${
            mode === "cash"
              ? "bg-accent text-white"
              : "border border-border bg-surface"
          }`}
          onClick={() => setMode("cash")}
        >
          Kontant
        </button>
        <button
          type="button"
          className={`min-h-11 rounded-[12px] px-4 text-sm ${
            mode === "financed"
              ? "bg-accent text-white"
              : "border border-border bg-surface"
          }`}
          onClick={() => setMode("financed")}
        >
          Finansierat
        </button>
      </div>

      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void mutation.mutate();
        }}
      >
        <label className="block text-sm md:col-span-2">
          <span className="text-text-secondary">Kontantkonto</span>
          <select
            required
            value={cashAccountId}
            onChange={(e) => setCashAccountId(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
          >
            <option value="">Välj konto</option>
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        {mode === "financed" ? (
          <label className="block text-sm md:col-span-2">
            <span className="text-text-secondary">Lånekonto</span>
            <select
              required
              value={loanAccountId}
              onChange={(e) => setLoanAccountId(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
            >
              <option value="">Välj lån</option>
              {loanAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block text-sm">
          <span className="text-text-secondary">Köpeskilling (kr)</span>
          <input
            required
            inputMode="decimal"
            value={priceKr}
            onChange={(e) => setPriceKr(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 tabular-nums"
          />
        </label>

        {mode === "financed" ? (
          <label className="block text-sm">
            <span className="text-text-secondary">Kontantinsats (kr)</span>
            <input
              inputMode="decimal"
              value={downKr}
              onChange={(e) => setDownKr(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 tabular-nums"
            />
          </label>
        ) : (
          <div />
        )}

        <label className="block text-sm">
          <span className="text-text-secondary">Datum</span>
          <input
            type="date"
            required
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
          />
        </label>

        <label className="block text-sm">
          <span className="text-text-secondary">Beskrivning</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
          />
        </label>

        <div className="md:col-span-2">
          {formError ? (
            <p className="mb-2 text-sm text-warning" role="alert">
              {formError}
            </p>
          ) : null}
          {okMsg ? (
            <p className="mb-2 text-sm text-positive" role="status">
              {okMsg}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={mutation.isPending || accountsQuery.isLoading}
            className="min-h-11 rounded-[12px] bg-accent px-4 text-sm text-white disabled:opacity-60"
          >
            {mutation.isPending ? "Sparar…" : "Bokför köp"}
          </button>
        </div>
      </form>
    </section>
  );
}
