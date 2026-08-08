import type { Metadata } from "next";
import { Suspense } from "react";
import { InviteAcceptPage } from "@/components/auth/invite-accept-page";

export const metadata: Metadata = {
  title: "Inbjudan",
};

export default function InviteRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-text-secondary">
          Laddar inbjudan…
        </div>
      }
    >
      <InviteAcceptPage />
    </Suspense>
  );
}
