"use client";

import { useEffect, useState } from "react";
import type { ToastDetail, ToastTone } from "@/lib/ui/toast";
import { toastEventName } from "@/lib/ui/toast";

type ToastMessage = ToastDetail & {
  id: number;
};

function toneClass(tone: ToastTone) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-rose-200 bg-rose-50 text-rose-900";
}

export default function ToastHost() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    function handler(event: Event) {
      const detail = (event as CustomEvent<ToastDetail>).detail;
      if (!detail?.text) return;
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { id, ...detail }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3500);
    }

    const eventName = toastEventName();
    window.addEventListener(eventName, handler as EventListener);
    return () => window.removeEventListener(eventName, handler as EventListener);
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 grid gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={"pointer-events-auto rounded-xl border px-3 py-2 text-sm shadow-sm " + toneClass(toast.tone)}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}
