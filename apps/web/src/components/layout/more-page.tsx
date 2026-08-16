"use client";

import Link from "next/link";
import { moreNav } from "./nav-config";

export function MorePage() {
  let lastSection = "";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-[family-name:var(--ffos-font-display)] text-3xl tracking-tight">
          Mer
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Förmögenhet, rådgivning, datakällor och inställningar.
        </p>
      </div>
      <nav aria-label="Fler sidor">
        <ul className="space-y-1">
          {moreNav.map((item) => {
            const showSection = item.section && item.section !== lastSection;
            if (item.section) lastSection = item.section;
            return (
              <li key={item.href}>
                {showSection ? (
                  <p className="mb-1 mt-4 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                    {item.section}
                  </p>
                ) : null}
                <Link
                  href={item.href}
                  className="flex min-h-11 items-center rounded-[12px] px-3 text-sm text-text-primary hover:bg-surface-elevated"
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
