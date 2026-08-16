"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  loginWithDemo,
  setHouseholdAfterCreate,
} from "@/lib/session";
import { kronorToMinorString } from "@/lib/money-input";
import { describeError } from "@/lib/error-message";

type Step = 0 | 1 | 2 | 3;
type Goal = "overview" | "spending" | "buffer" | "future";

const GOALS: Array<{ value: Goal; title: string; description: string }> = [
  {
    value: "overview",
    title: "Få en gemensam överblick",
    description: "Samla konton och se hushållets läge på ett ställe.",
  },
  {
    value: "spending",
    title: "Förstå utgifterna",
    description: "Se vad som förändras och vad som driver kostnaderna.",
  },
  {
    value: "buffer",
    title: "Bygga en trygg buffert",
    description: "Planera en reserv som passar hushållets verkliga behov.",
  },
  {
    value: "future",
    title: "Planera framåt",
    description: "Få koll på kommande betalningar, mål och scenarier.",
  },
];

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
  const [goal, setGoal] = useState<Goal>("overview");
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

  function continueWithOwnData(path: "/imports" | "/accounts" | "/") {
    router.replace(path);
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
          ? "Demodata är avstängt i den här installationen. Börja med ett kontoutdrag eller lägg till ett konto manuellt."
          : message || "Demo misslyckades",
      );
    } finally {
      setBusy(false);
    }
  }

  const selectedGoal = GOALS.find((item) => item.value === goal)!;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <div>
        <p className="text-sm font-medium text-accent">Fyra korta steg</p>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Kom igång
        </h1>
        <p className="mt-2 font-[family-name:var(--ffos-font-display)] text-2xl tracking-tight text-text-primary">
          Gör ekonomin användbar för hela hushållet
        </p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
          Börja med vad ni vill uppnå. Därefter lägger ni till data och får en
          översikt som visar vad som behöver uppmärksamhet.
        </p>
        <div className="mt-5 grid grid-cols-4 gap-2" aria-label={`Steg ${step + 1} av 4`}>
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className={`h-1.5 rounded-full ${
                index <= step ? "bg-accent" : "bg-border"
              }`}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-text-muted">Steg {step + 1} av 4</p>
      </div>

      {error ? (
        <p className="text-sm text-warning" role="alert">
          {error}
        </p>
      ) : null}

      {step === 0 ? (
        <section className="space-y-5 rounded-[18px] bg-surface-elevated p-5 md:p-6">
          <div>
            <h2 className="text-xl font-medium">Vad kallar ni hushållet?</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Namnet syns bara för medlemmarna i hushållet.
            </p>
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="text-text-secondary">Hushållsnamn</span>
            <input
              className="min-h-12 w-full rounded-[12px] border border-border bg-surface px-3"
              value={name}
              autoComplete="organization"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div
            data-testid="household-currency"
            className="rounded-[12px] bg-surface-muted px-4 py-3 text-sm text-text-secondary"
          >
            Alla summor visas i <strong className="text-text-primary">{currency}</strong>.
            Stöd för fler valutor kommer senare.
          </div>
          <button
            type="button"
            disabled={!name.trim()}
            className="min-h-12 rounded-[12px] bg-accent px-5 text-sm font-medium text-on-accent disabled:opacity-50"
            onClick={() => setStep(1)}
          >
            Fortsätt
          </button>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="space-y-5 rounded-[18px] bg-surface-elevated p-5 md:p-6">
          <div>
            <h2 className="text-xl font-medium">Vad vill ni börja med?</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Valet hjälper oss att visa en relevant första väg. Det går att
              använda alla delar senare.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {GOALS.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={goal === item.value}
                onClick={() => setGoal(item.value)}
                className={`min-h-24 rounded-[14px] border p-4 text-left transition ${
                  goal === item.value
                    ? "border-accent bg-accent/10"
                    : "border-border bg-surface hover:border-border-strong"
                }`}
              >
                <span className="block text-sm font-medium text-text-primary">
                  {item.title}
                </span>
                <span className="mt-1 block text-xs leading-5 text-text-muted">
                  {item.description}
                </span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-12 rounded-[12px] border border-border px-4 text-sm"
              onClick={() => setStep(0)}
            >
              Tillbaka
            </button>
            <button
              type="button"
              className="min-h-12 rounded-[12px] bg-accent px-5 text-sm font-medium text-on-accent"
              onClick={() => setStep(2)}
            >
              Fortsätt
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-5 rounded-[18px] bg-surface-elevated p-5 md:p-6">
          <div>
            <h2 className="text-xl font-medium">Sätt ett första buffertmål</h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Ett riktmärke räcker. När data finns räknar appen fram ett mer
              personligt intervall utifrån hushållets utgifter.
            </p>
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="text-text-secondary">Buffertmål</span>
            <div className="relative">
              <input
                className="min-h-12 w-full rounded-[12px] border border-border bg-surface px-3 pr-12"
                value={buffer}
                inputMode="decimal"
                aria-describedby="buffer-guidance"
                onChange={(e) => setBuffer(e.target.value)}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
                kr
              </span>
            </div>
          </label>
          <p id="buffer-guidance" className="text-xs text-text-muted">
            Vanligt riktmärke: två till tre månaders nödvändiga utgifter.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-12 rounded-[12px] border border-border px-4 text-sm"
              onClick={() => setStep(1)}
            >
              Tillbaka
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-12 rounded-[12px] bg-accent px-5 text-sm font-medium text-on-accent disabled:opacity-60"
              onClick={() => void createHousehold()}
            >
              {busy ? "Skapar…" : "Skapa hushåll och fortsätt"}
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-5 rounded-[18px] bg-surface-elevated p-5 md:p-6">
          <div>
            <p className="text-sm font-medium text-positive">
              {householdId ? "Hushållet är klart" : "Nästan klart"}
            </p>
            <h2 className="mt-1 text-xl font-medium">Lägg till den första datan</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Ni vill börja med <strong>{selectedGoal.title.toLowerCase()}</strong>.
              Ett kontoutdrag ger snabbast en användbar översikt.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            className="min-h-12 w-full rounded-[12px] bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60"
            onClick={() => continueWithOwnData("/imports")}
          >
            Importera kontoutdrag
          </button>
          <button
            type="button"
            disabled={busy}
            className="min-h-12 w-full rounded-[12px] border border-border-strong px-4 text-sm disabled:opacity-60"
            onClick={() => continueWithOwnData("/accounts")}
          >
            Lägg till konton manuellt
          </button>
          {demoAvailable ? (
            <button
              type="button"
              disabled={busy}
              className="min-h-12 w-full rounded-[12px] border border-border px-4 text-sm disabled:opacity-60"
              onClick={() => void finishDemo()}
            >
              Utforska med demodata
            </button>
          ) : (
            <p className="text-xs text-text-muted">
              Demodata är avstängt i den här installationen.
            </p>
          )}
          <button
            type="button"
            className="min-h-11 w-full text-sm text-accent"
            onClick={() => continueWithOwnData("/")}
          >
            Gå till en tom översikt
          </button>
        </section>
      ) : null}
    </div>
  );
}
