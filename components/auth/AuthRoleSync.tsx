"use client";

import { useEffect } from "react";

export default function AuthRoleSync({ enabled, bootstrapEnabled }: { enabled: boolean; bootstrapEnabled: boolean }) {
  useEffect(() => {
    if (!enabled || !bootstrapEnabled) return;
    const ctrl = new AbortController();
    const run = async () => {
      try {
        const res = await fetch("/api/auth/session/bootstrap", {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          signal: ctrl.signal,
        });
        if (res.ok) return;
      } catch {}
      void fetch("/api/auth/role-sync", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        signal: ctrl.signal,
      }).catch(() => {});
    };
    void run();
    return () => ctrl.abort();
  }, [enabled, bootstrapEnabled]);

  return null;
}
