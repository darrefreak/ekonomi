"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  contextNavForPathname,
  primaryHrefForPathname,
  primaryNav,
} from "./nav-config";

export function DesktopSidebar() {
  const pathname = usePathname();
  const primaryHref = primaryHrefForPathname(pathname);
  const contextItems = contextNavForPathname(pathname);
  const contextTitle =
    primaryHref === "/"
      ? "Just nu"
      : primaryNav.find((item) => item.href === primaryHref)?.label ?? "Fler delar";
  let lastSection = "";

  return (
    <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-60 md:flex-col md:border-r md:border-border md:bg-surface-elevated/80 md:backdrop-blur">
      <div className="px-5 py-5">
        <p className="font-[family-name:var(--ffos-font-display)] text-lg tracking-tight text-text-primary">
          Family Financial OS
        </p>
        <p className="mt-1 text-sm text-text-muted">Ekonomin, samlad och begriplig</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-6" aria-label="Huvudnavigation">
        <ul className="space-y-1">
          {primaryNav.map((item) => {
            const active = primaryHref === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={`flex min-h-11 items-center rounded-[10px] px-3 text-sm transition ${
                    active
                      ? "bg-accent/10 font-medium text-accent"
                      : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {contextItems.length > 0 ? (
          <>
            <p className="mb-1 mt-6 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              {contextTitle}
            </p>
            <ul className="space-y-1">
              {contextItems.map((item) => {
                const showSection =
                  primaryHref === "/more" &&
                  Boolean(item.section) &&
                  item.section !== lastSection;
                if (item.section) lastSection = item.section;
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    {showSection ? (
                      <p className="mb-1 mt-4 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                        {item.section}
                      </p>
                    ) : null}
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-11 items-center rounded-[10px] px-3 text-sm transition ${
                        active
                          ? "bg-surface-muted font-medium text-text-primary"
                          : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </nav>
    </aside>
  );
}
