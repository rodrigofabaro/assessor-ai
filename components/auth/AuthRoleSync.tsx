"use client";

import { useEffect } from "react";

export default function AuthRoleSync({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    void fetch("/api/auth/role-sync", {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      signal: ctrl.signal,
    }).catch(() => {});
    return () => ctrl.abort();
  }, [enabled]);

  return null;
}

