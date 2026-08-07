"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/session";
import { DesktopSidebar } from "./desktop-sidebar";
import { MobileNavigation } from "./mobile-navigation";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl">
      <a href="#main-content" className="skip-link">
        Hoppa till innehåll
      </a>
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between border-b border-border/80 bg-surface/80 px-4 backdrop-blur md:px-8">
          <p className="text-sm text-text-secondary md:hidden">Family Financial OS</p>
          <p className="hidden text-sm text-text-muted md:block">
            Sök med Ctrl/Cmd+K (kommer snart)
          </p>
          <div className="flex items-center gap-3">
            <p className="text-sm text-text-secondary" aria-label="Miljö">
              Demo
            </p>
            <button
              type="button"
              className="min-h-11 rounded-[12px] border border-border px-3 text-sm text-text-secondary hover:text-text-primary"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
            >
              Logga ut
            </button>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 pb-24 pt-5 outline-none md:px-8 md:pb-10 md:pt-8"
        >
          {children}
        </main>
        <MobileNavigation />
      </div>
    </div>
  );
}
