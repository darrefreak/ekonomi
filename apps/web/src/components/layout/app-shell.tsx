import type { ReactNode } from "react";
import { DesktopSidebar } from "./desktop-sidebar";
import { MobileNavigation } from "./mobile-navigation";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between border-b border-border/80 bg-surface/80 px-4 backdrop-blur md:px-8">
          <p className="text-sm text-text-secondary md:hidden">Family Financial OS</p>
          <p className="hidden text-sm text-text-muted md:block">
            Sök med Ctrl/Cmd+K (kommer snart)
          </p>
          <p className="text-sm text-text-secondary">Demo</p>
        </header>
        <main className="flex-1 px-4 pb-24 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>
        <MobileNavigation />
      </div>
    </div>
  );
}
