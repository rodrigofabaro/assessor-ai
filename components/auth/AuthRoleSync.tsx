"use client";

import { useEffect } from "react";

export default function AuthRoleSync({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled]);

  return null;
}
