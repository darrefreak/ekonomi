"use client";

import { useState } from "react";
import type { AccountDto } from "@ffos/schemas";
import { api } from "@/lib/api";
import { useSubmissionKey } from "@/lib/idempotency";
import { kronorToMinorString } from "@/lib/money-input";
import { ensureHouseholdSession } from "@/lib/session";
import { describeError } from "@/lib/error-message";

const CASH_LIKE = new Set(["CHECKING", "SAVINGS", "CASH"]);

type AcquisitionMode = "EXISTING" | "NEW_PURCHASE";
type PurchaseType = "CASH" | "FINANCED" | "PRIVATE_LEASE";

const FUEL_OPTIONS = [
  ["PETROL", "Bensin"],
  ["DIESEL", "Diesel"],
  ["HYBRID", "Hybrid"],
  ["PLUGIN_HYBRID", "Laddhybrid"],
  ["ELECTRIC", "El"],
  ["OTHER", "Annat"],
] as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const inputClass =
  "mt-1 min-h-11 w-full rounded-[12px] border border-border bg-surface px-3 text-sm";

/**
 * Add a vehicle the way a household really gets one: either onboarding a car
 * they already own (opening position, no fake spending this month) or booking
 * a purchase made today.
 */
export function AddVehicleForm({
  onCreated,
  onCancel,
}: {
  onCreated: (vehicleId: string) => void;
  onCancel: () => void;
}) {
  const submissionKey = useSubmissionKey();
  const [acquisitionMode, setAcquisitionMode] =
    useState<AcquisitionMode>("EXISTING");
  const [purchaseType, setPurchaseType] = useState<PurchaseType>("CASH");
  const [showDetails, setShowDetails] = useState(false);
  const [accounts, setAccounts] = useState<AccountDto[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [variant, setVariant] = useState("");
  const [modelYear, setModelYear] = useState("");
  const [fuelType, setFuelType] = useState("PETROL");
  const [transmission, setTransmission] = useState("");
  const [seats, setSeats] = useState("");
  const [isofixCount, setIsofixCount] = useState("");
  const [odometerKm, setOdometerKm] = useState("");
  const [annualKm, setAnnualKm] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayIso());
  const [purchasePrice, setPurchasePrice] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [downPayment, setDownPayment] = useState("");
  const [outstandingDebt, setOutstandingDebt] = useState("");
  const [lender, setLender] = useState("");
  const [interestPercent, setInterestPercent] = useState("");
  const [monthlyPayment, setMonthlyPayment] = useState("");

  const needsCashAccount =
    acquisitionMode === "NEW_PURCHASE" && purchaseType !== "PRIVATE_LEASE";
  const isFinanced = purchaseType === "FINANCED";

  async function loadAccounts() {
    if (accounts) return;
    const householdId = await ensureHouseholdSession();
    const res = await api.listAccounts(householdId);
    setAccounts(res.items.filter((a) => CASH_LIKE.has(a.accountType)));
  }

  async function submit() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const householdId = await ensureHouseholdSession();
      const priceMinor = kronorToMinorString(purchasePrice);
      const valueMinor = kronorToMinorString(currentValue || purchasePrice);
      if (priceMinor == null || BigInt(priceMinor) <= 0n) {
        throw new Error("Ange ett positivt inköpspris i kronor.");
      }
      if (valueMinor == null) {
        throw new Error("Ange ett giltigt nuvarande värde i kronor.");
      }
      const vehicle = await api.createVehicle(
        {
          householdId,
          name: name.trim(),
          make: make.trim(),
          model: model.trim(),
          variant: variant.trim() || undefined,
          modelYear: Number(modelYear),
          fuelType: fuelType as "PETROL",
          transmission: (transmission || undefined) as "MANUAL" | undefined,
          seats: seats ? Number(seats) : undefined,
          isofixCount: isofixCount ? Number(isofixCount) : undefined,
          currentOdometerKm: odometerKm ? Number(odometerKm) : undefined,
          annualKm: annualKm ? Number(annualKm) : undefined,
          currency: "SEK",
          acquisitionMode,
          purchaseType,
          purchaseDate,
          purchasePriceMinor: priceMinor,
          currentValueMinor: valueMinor,
          cashAccountId: needsCashAccount ? cashAccountId : undefined,
          downPaymentMinor: isFinanced
            ? (kronorToMinorString(downPayment || "0") ?? "0")
            : undefined,
          outstandingDebtMinor: isFinanced
            ? (kronorToMinorString(outstandingDebt || "0") ?? "0")
            : undefined,
          financeLender: isFinanced ? lender.trim() || undefined : undefined,
          financeInterestRateBps:
            isFinanced && interestPercent
              ? Math.round(Number(interestPercent) * 100)
              : undefined,
          financeMonthlyPaymentMinor:
            isFinanced && monthlyPayment
              ? (kronorToMinorString(monthlyPayment) ?? undefined)
              : undefined,
        },
        { idempotencyKey: submissionKey.current() },
      );
      submissionKey.renew();
      onCreated(vehicle.id);
    } catch (err) {
      setError(describeError(err, "Kunde inte spara fordonet."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      aria-label="Lägg till fordon"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-4 rounded-[16px] bg-surface-elevated p-4"
    >
      <h2 className="text-lg font-medium">Lägg till fordon</h2>

      <fieldset className="space-y-2">
        <legend className="text-sm text-text-muted">Hur fick du bilen?</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["EXISTING", "Jag äger den redan"],
              ["NEW_PURCHASE", "Jag köper den nu"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={acquisitionMode === value}
              onClick={() => {
                setAcquisitionMode(value);
                if (value === "NEW_PURCHASE") void loadAccounts();
              }}
              className={`min-h-11 rounded-[12px] px-4 text-sm font-medium ${
                acquisitionMode === value
                  ? "bg-accent text-on-accent"
                  : "border border-border bg-surface text-text-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-secondary">
          {acquisitionMode === "EXISTING"
            ? "Bilen läggs in som ingående position — den skapar ingen utgift eller inkomst den här månaden."
            : "Köpet bokförs idag: kontanter minskar, tillgången ökar. Ett köp är inte konsumtion."}
        </p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm text-text-muted">Ägandeform</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["CASH", "Kontant"],
              ["FINANCED", "Billån"],
              ["PRIVATE_LEASE", "Privatleasing"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={purchaseType === value}
              onClick={() => setPurchaseType(value)}
              className={`min-h-11 rounded-[12px] px-4 text-sm font-medium ${
                purchaseType === value
                  ? "bg-accent text-on-accent"
                  : "border border-border bg-surface text-text-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="text-text-muted">Namn</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Märke</span>
          <input
            required
            value={make}
            onChange={(e) => setMake(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Modell</span>
          <input
            required
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Årsmodell</span>
          <input
            required
            inputMode="numeric"
            value={modelYear}
            onChange={(e) => setModelYear(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Drivmedel</span>
          <select
            value={fuelType}
            onChange={(e) => setFuelType(e.target.value)}
            className={inputClass}
          >
            {FUEL_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Mätarställning (km)</span>
          <input
            inputMode="numeric"
            value={odometerKm}
            onChange={(e) => setOdometerKm(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">
            {acquisitionMode === "EXISTING" ? "Inköpsdatum" : "Köpdatum"}
          </span>
          <input
            required
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Inköpspris (kr)</span>
          <input
            required
            inputMode="decimal"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Nuvarande värde (kr)</span>
          <input
            required
            inputMode="decimal"
            value={currentValue}
            onChange={(e) => setCurrentValue(e.target.value)}
            className={inputClass}
          />
        </label>

        {needsCashAccount ? (
          <label className="block text-sm">
            <span className="text-text-muted">Betalas från konto</span>
            <select
              required
              value={cashAccountId}
              onFocus={() => void loadAccounts()}
              onChange={(e) => setCashAccountId(e.target.value)}
              className={inputClass}
            >
              <option value="">Välj konto</option>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {isFinanced ? (
          <>
            <label className="block text-sm">
              <span className="text-text-muted">Kvarvarande skuld (kr)</span>
              <input
                required
                inputMode="decimal"
                value={outstandingDebt}
                onChange={(e) => setOutstandingDebt(e.target.value)}
                className={inputClass}
              />
            </label>
            {acquisitionMode === "NEW_PURCHASE" ? (
              <label className="block text-sm">
                <span className="text-text-muted">Kontantinsats (kr)</span>
                <input
                  inputMode="decimal"
                  value={downPayment}
                  onChange={(e) => setDownPayment(e.target.value)}
                  className={inputClass}
                />
              </label>
            ) : null}
          </>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="text-sm text-accent underline"
      >
        {showDetails ? "Dölj fler detaljer" : "Fler detaljer (valfritt)"}
      </button>

      {showDetails ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-text-muted">Variant</span>
            <input
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Växellåda</span>
            <select
              value={transmission}
              onChange={(e) => setTransmission(e.target.value)}
              className={inputClass}
            >
              <option value="">Ej angivet</option>
              <option value="MANUAL">Manuell</option>
              <option value="AUTOMATIC">Automat</option>
              <option value="OTHER">Annat</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Antal säten</span>
            <input
              inputMode="numeric"
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">ISOFIX-platser</span>
            <input
              inputMode="numeric"
              value={isofixCount}
              onChange={(e) => setIsofixCount(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Körsträcka per år (km)</span>
            <input
              inputMode="numeric"
              value={annualKm}
              onChange={(e) => setAnnualKm(e.target.value)}
              className={inputClass}
            />
          </label>
          {isFinanced ? (
            <>
              <label className="block text-sm">
                <span className="text-text-muted">Långivare</span>
                <input
                  value={lender}
                  onChange={(e) => setLender(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block text-sm">
                <span className="text-text-muted">Ränta (%)</span>
                <input
                  inputMode="decimal"
                  value={interestPercent}
                  onChange={(e) => setInterestPercent(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block text-sm">
                <span className="text-text-muted">Månadsbetalning (kr)</span>
                <input
                  inputMode="decimal"
                  value={monthlyPayment}
                  onChange={(e) => setMonthlyPayment(e.target.value)}
                  className={inputClass}
                />
              </label>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60"
        >
          {pending ? "Sparar…" : "Spara fordon"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-[12px] border border-border px-4 text-sm"
        >
          Avbryt
        </button>
      </div>
    </form>
  );
}
