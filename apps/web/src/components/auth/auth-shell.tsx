"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getHouseholdId, hasSession } from "@/lib/session";

export function AuthShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";
  const isOnboarding = pathname === "/onboarding";
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const authed = hasSession();
    const householdId = getHouseholdId();

    if (isLogin) {
      if (authed && householdId) {
        router.replace("/");
        return;
      }
      if (authed && !householdId) {
        router.replace("/onboarding");
        return;
      }
      setReady(true);
      return;
    }

    if (!authed) {
      router.replace("/login");
      return;
    }

    if (!householdId && !isOnboarding) {
      router.replace("/onboarding");
      return;
    }

    setReady(true);
  }, [isLogin, isOnboarding, pathname, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-sm text-text-secondary">
        {isLogin ? "Laddar…" : "Kontrollerar inloggning…"}
      </div>
    );
  }

  if (isLogin) return <>{children}</>;
  return <AppShell>{children}</AppShell>;
}
