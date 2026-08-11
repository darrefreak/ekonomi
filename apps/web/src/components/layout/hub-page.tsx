import Link from "next/link";
import type { NavItem } from "./nav-config";

/**
 * A hub is a lightweight index page behind a bottom-nav tab. It exists so the
 * mobile navigation can stay at five tabs while every feature stays one tap
 * away. Descriptions say what question each page answers, not what it is.
 */
export function HubPage({
  title,
  description,
  items,
  descriptions,
}: {
  title: string;
  description: string;
  items: NavItem[];
  descriptions?: Record<string, string>;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          {title}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">{description}</p>
      </div>
      <nav aria-label={title}>
        <ul className="divide-y divide-border rounded-[16px] bg-surface-elevated">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex min-h-14 flex-col justify-center px-4 py-3 hover:bg-surface"
              >
                <span className="text-sm font-medium text-text-primary">
                  {item.label}
                </span>
                {descriptions?.[item.href] ? (
                  <span className="mt-0.5 text-xs text-text-muted">
                    {descriptions[item.href]}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
