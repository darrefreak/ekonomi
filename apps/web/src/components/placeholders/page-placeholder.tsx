import { EmptyState } from "../feedback/empty-state";

export function PagePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-4">
      <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
        {title}
      </h1>
      <EmptyState title="Kommer i en senare fas" description={description} />
    </div>
  );
}
