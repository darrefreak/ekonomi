import type { MoneyJson } from "@ffos/domain";

type Point = {
  month: string;
  income: MoneyJson;
  spending: MoneyJson;
};

export function MiniCashflowChart({ points }: { points: Point[] }) {
  if (!points.length) {
    return <p className="text-sm text-text-muted">Ingen kassaflödeshistorik ännu.</p>;
  }

  const max = Math.max(
    ...points.flatMap((p) => [
      Number(p.income.amountMinor),
      Number(p.spending.amountMinor),
    ]),
    1,
  );

  return (
    <div className="space-y-3" role="img" aria-label="Kassaflöde per månad">
      {points.map((point) => {
        const incomePct = (Number(point.income.amountMinor) / max) * 100;
        const spendPct = (Number(point.spending.amountMinor) / max) * 100;
        return (
          <div key={point.month} className="grid grid-cols-[4.5rem_1fr] items-center gap-3">
            <span className="text-xs tabular-nums text-text-muted">{point.month}</span>
            <div className="space-y-1">
              <div
                className="h-2 rounded-full bg-accent/80"
                style={{ width: `${Math.max(incomePct, 2)}%` }}
                title="Inkomst"
              />
              <div
                className="h-2 rounded-full bg-text-muted/40"
                style={{ width: `${Math.max(spendPct, 2)}%` }}
                title="Utgifter"
              />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-text-muted">Grön = inkomst · grå = utgifter</p>
    </div>
  );
}
