"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  DEMO_CREDENTIALS,
  loginWithCredentials,
  loginWithDemo,
  setHouseholdAfterCreate,
} from "@/lib/session";
import { kronorToMinorString } from "@/lib/money-input";

type Step = 0 | 1 | 2 | 3;
type SupportedCurrency = "SEK" | "EUR" | "USD" | "NOK" | "DKK";

export function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("Mitt hushåll");
  const [currency, setCurrency] = useState<SupportedCurrency>("SEK");
  const [buffer, setBuffer] = useState("120000");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [householdId, setHouseholdId] = useState<string | null>(null);

  async function createHousehold() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createHousehold({
        name: name.trim() || "Mitt hushåll",
        baseCurrency: currency,
      });
      setHouseholdAfterCreate(created.id);
      setHouseholdId(created.id);
      await api.updateSettings({
        householdId: created.id,
        financialPolicies: {
          emergencyFundTargetMinor:
            kronorToMinorString(buffer) ?? "12000000",
          currency,
        },
      });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skapa hushåll");
    } finally {
      setBusy(false);
    }
  }

  async function finishEmpty() {
    router.replace("/");
    router.refresh();
  }

  async function finishDemo() {
    setBusy(true);
    setError(null);
    try {
      try {
        await api.loadDemo();
      } catch {
        // reseed may be gated; demo login still works if seed exists
      }
      await loginWithDemo();
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo misslyckades");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-4">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Kom igång
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Steg {step + 1} av 4 — skapa hushåll eller ladda demodata
        </p>
      </div>

      {error ? (
        <p className="text-sm text-warning" role="alert">
          {error}
        </p>
      ) : null}

      {step === 0 ? (
        <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm font-medium">Hushållsnamn</h2>
          <input
            className="min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            className="min-h-11 rounded-[12px] bg-accent px-4 text-sm text-white"
            onClick={() => setStep(1)}
          >
            Fortsätt
          </button>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm font-medium">Valuta</h2>
          <select
            className="min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
            value={currency}
            onChange={(e) =>
              setCurrency(e.target.value as SupportedCurrency)
            }
          >
            <option value="SEK">SEK</option>
            <option value="EUR">EUR</option>
            <option value="NOK">NOK</option>
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-[12px] border border-border px-4 text-sm"
              onClick={() => setStep(0)}
            >
              Tillbaka
            </button>
            <button
              type="button"
              className="min-h-11 rounded-[12px] bg-accent px-4 text-sm text-white"
              onClick={() => setStep(2)}
            >
              Fortsätt
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm font-medium">Buffertmål ({currency})</h2>
          <input
            className="min-h-11 w-full rounded-[12px] border border-border bg-surface px-3"
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-[12px] border border-border px-4 text-sm"
              onClick={() => setStep(1)}
            >
              Tillbaka
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-11 rounded-[12px] bg-accent px-4 text-sm text-white disabled:opacity-60"
              onClick={() => void createHousehold()}
            >
              {busy ? "Skapar…" : "Skapa hushåll"}
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm font-medium">Hur vill du börja?</h2>
          <p className="text-sm text-text-secondary">
            Hushåll {householdId ? "skapades" : "klart"}. Välj tom start eller demodata (
            {DEMO_CREDENTIALS.email}).
          </p>
          <button
            type="button"
            disabled={busy}
            className="min-h-11 w-full rounded-[12px] bg-accent px-4 text-sm text-white disabled:opacity-60"
            onClick={() => void finishEmpty()}
          >
            Börja tomt
          </button>
          <button
            type="button"
            disabled={busy}
            className="min-h-11 w-full rounded-[12px] border border-border px-4 text-sm disabled:opacity-60"
            onClick={() => void finishDemo()}
          >
            Ladda demodata
          </button>
          <button
            type="button"
            className="text-sm text-accent"
            onClick={() =>
              void loginWithCredentials(
                DEMO_CREDENTIALS.email,
                DEMO_CREDENTIALS.password,
              ).then(() => {
                router.replace("/");
              })
            }
          >
            Redan har demo? Logga in →
          </button>
        </section>
      ) : null}
    </div>
  );
}
