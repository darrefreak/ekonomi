"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { hasSession } from "@/lib/session";

export function AuthShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const authed = hasSession();
    if (isLogin) {
      if (authed) {
        router.replace("/");
        return;
      }
      setReady(true);
      return;
    }

    if (!authed) {
      router.replace("/login");
      return;
    }

    setReady(true);
  }, [isLogin, pathname, router]);

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
