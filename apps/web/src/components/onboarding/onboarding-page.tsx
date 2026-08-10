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
import { describeError } from "@/lib/error-message";

type Step = 0 | 1 | 2 | 3;

/**
 * V1 totals a household in one currency and has no exchange-rate engine, so
 * SEK is the only currency it can carry end to end. This screen used to offer
 * EUR and NOK, and a household created in either could never open an account
 * (FPR-001). It is stated rather than chosen.
 */
const HOUSEHOLD_CURRENCY = "SEK";

export function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("Mitt hushåll");
  const currency = HOUSEHOLD_CURRENCY;
  const [buffer, setBuffer] = useState("120000");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  // Whether this deployment has demo data at all. A pilot or production
  // deployment does not, and offering the choice there only leads to a refusal.
  const [demoAvailable, setDemoAvailable] = useState<boolean | null>(null);

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
      try {
        const demo = await api.getDemoInfo();
        setDemoAvailable(demo.reseedAllowed);
      } catch {
        setDemoAvailable(false);
      }
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
      setError(describeError(err, "Kunde inte skapa hushåll"));
    } finally {
      setBusy(false);
    }
  }

  async function finishEmpty() {
    router.replace("/");
    router.refresh();
  }

  /**
   * Demo data is refused in deployments that hold real data, and in those the
   * demo household does not exist either. Swallowing the refusal and going on
   * to sign in as the demo user produced "Invalid credentials" — which reads
   * like a mistyped password rather than "this deployment has no demo".
   */
  async function finishDemo() {
    setBusy(true);
    setError(null);
    try {
      await api.loadDemo();
      await loginWithDemo();
      router.replace("/");
      router.refresh();
    } catch (err) {
      const message = describeError(err, "");
      setError(
        /forbidden|disabled|403/i.test(message)
          ? "Demodata är avstängt i den här installationen, som innehåller riktiga uppgifter. Välj “Börja tomt”."
          : message || "Demo misslyckades",
      );
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
            className="min-h-11 rounded-[12px] bg-accent px-4 text-sm text-on-accent"
            onClick={() => setStep(1)}
          >
            Fortsätt
          </button>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="space-y-3 rounded-[16px] bg-surface-elevated p-5">
          <h2 className="text-sm font-medium">Valuta</h2>
          <div
            data-testid="household-currency"
            className="flex min-h-11 w-full items-center rounded-[12px] border border-border bg-surface-muted px-3 text-sm"
          >
            {currency}
          </div>
          <p className="text-xs text-text-secondary">
            Hushållet räknar alla summor i {currency}. Fler valutor kommer
            senare.
          </p>
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
              className="min-h-11 rounded-[12px] bg-accent px-4 text-sm text-on-accent"
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
              className="min-h-11 rounded-[12px] bg-accent px-4 text-sm text-on-accent disabled:opacity-60"
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
            {demoAvailable
              ? `Hushåll ${householdId ? "skapades" : "klart"}. Välj tom start eller demodata (${DEMO_CREDENTIALS.email}).`
              : `Hushåll ${householdId ? "skapades" : "klart"}. Börja med dina egna uppgifter.`}
          </p>
          <button
            type="button"
            disabled={busy}
            className="min-h-11 w-full rounded-[12px] bg-accent px-4 text-sm text-on-accent disabled:opacity-60"
            onClick={() => void finishEmpty()}
          >
            Börja tomt
          </button>
          {demoAvailable ? (
            <button
              type="button"
              disabled={busy}
              className="min-h-11 w-full rounded-[12px] border border-border px-4 text-sm disabled:opacity-60"
              onClick={() => void finishDemo()}
            >
              Ladda demodata
            </button>
          ) : (
            <p className="text-xs text-text-muted">
              Demodata är avstängt i den här installationen.
            </p>
          )}
          {demoAvailable ? (
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
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
