type Area = {
  key: string;
  label: string;
  status: "present" | "warning" | "missing";
};

const statusLabel = {
  present: "✓",
  warning: "⚠",
  missing: "Saknas",
} as const;

export function CoverageList({
  percent,
  areas,
}: {
  percent: number;
  areas: Area[];
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
    </div>
  );
}
