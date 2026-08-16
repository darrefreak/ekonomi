"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mobileNav, primaryHrefForPathname } from "./nav-config";

export function MobileNavigation() {
  const pathname = usePathname();
  const primaryHref = primaryHrefForPathname(pathname);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-elevated/95 backdrop-blur md:hidden"
      aria-label="Mobilnavigation"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {mobileNav.map((item) => {
          const active = primaryHref === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center text-xs transition ${
                  active ? "font-semibold text-accent" : "text-text-muted"
                }`}
              >
                <span
                  aria-hidden
                  className={`mb-1 h-1 w-5 rounded-full transition ${
                    active ? "bg-accent" : "bg-transparent"
                  }`}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
