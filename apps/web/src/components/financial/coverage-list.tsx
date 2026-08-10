type Area = {
  key: string;
  label: string;
  status: "present" | "warning" | "missing";
};

type FreshnessRow = {
  sourceName: string;
  status: string;
  freshnessLabel: string | null;
};

const statusLabel = {
  present: "✓",
  warning: "⚠",
  missing: "Saknas",
} as const;

export function CoverageList({
  percent,
  areas,
  freshness,
}: {
  percent: number;
  areas: Area[];
  freshness?: FreshnessRow[];
}) {
  return (
    <div>
      <p className="text-sm text-text-secondary">Datatäckning</p>
      <p className="mt-1 text-2xl font-medium tabular-nums text-text-primary">
        {percent} %
      </p>
      <ul className="mt-4 space-y-2">
        {areas.map((area) => (
          <li
            key={area.key}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="text-text-secondary">{area.label}</span>
            <span
              className={
                area.status === "present"
                  ? "text-positive"
                  : area.status === "warning"
                    ? "text-warning"
                    : "text-text-muted"
              }
            >
              {statusLabel[area.status]}
            </span>
          </li>
        ))}
      </ul>
      {freshness && freshness.length > 0 ? (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs font-medium text-text-secondary">Källors freshness</p>
          <ul className="mt-2 space-y-1.5">
            {freshness.map((row) => (
              <li
                key={`${row.sourceName}-${row.status}`}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="text-text-muted">{row.sourceName}</span>
                <span className="text-text-secondary">
                  {row.freshnessLabel ?? row.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
