"use client";

import { useMemo, useState } from "react";
import { useReferenceAdmin } from "../reference/reference.logic";

export type UploadResult = {
  fileName: string;
  ok: boolean;
  reason?: string;
};

export type ToastMessage = {
  id: number;
  tone: "success" | "error" | "warn";
  text: string;
};

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function useSpecsAdmin() {
  const vm = useReferenceAdmin({
    context: "specs",
    fixedInboxType: "SPEC",
    fixedUploadType: "SPEC",
  });

  const [tab, setTab] = useState<"library" | "extract">("library");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const extracted = (vm.selectedDoc?.extractedJson || null) as any;
  const learningOutcomes = Array.isArray(extracted?.learningOutcomes) ? extracted.learningOutcomes : [];

  const counts = useMemo(
    () => ({ total: vm.documents.length, shown: vm.filteredDocuments.length }),
    [vm.documents.length, vm.filteredDocuments.length],
  );

  const pushToast = (tone: ToastMessage["tone"], text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, tone, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  const uploadFiles = async (incoming: File[]) => {
    if (!incoming.length || uploading) return;

    const valid = incoming.filter(isPdf);
    const skipped = incoming.filter((f) => !isPdf(f));
    const suspicious = valid.filter((f) => !/(unit|spec)/i.test(f.name));

    if (skipped.length) {
      pushToast(
        "warn",
        skipped.length === incoming.length
          ? "Only PDF files are supported."
          : `Skipped ${skipped.length} file(s). Only PDF files are supported.`,
      );
    }
    if (suspicious.length) {
      pushToast("warn", `${suspicious.length} filename(s) did not include “Unit” or “Spec”. Uploaded anyway.`);
    }
    if (!valid.length) return;

    setUploading(true);
    setUploadStatus(`Uploading ${valid.length} file${valid.length > 1 ? "s" : ""}...`);

    try {
      const settled = await Promise.all(
        valid.map(async (file): Promise<UploadResult> => {
          const fd = new FormData();
          fd.set("type", "SPEC");
          fd.set("title", file.name);
          fd.set("version", "1");
          fd.set("file", file);

          const res = await fetch("/api/reference-documents", { method: "POST", body: fd });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            return {
              fileName: file.name,
              ok: false,
              reason: (data as any)?.error || (data as any)?.message || "Upload failed",
            };
          }
          return { fileName: file.name, ok: true };
        }),
      );

      const okCount = settled.filter((r) => r.ok).length;
      const failCount = settled.length - okCount;

      if (okCount > 0) {
        await vm.refreshAll({ keepSelection: false });
        pushToast("success", `Uploaded ${okCount} spec${okCount > 1 ? "s" : ""}. Ready to extract.`);
      }
      if (failCount > 0) {
        const reason = settled.find((r) => !r.ok)?.reason || "Upload failed";
        pushToast("error", `Upload failed: ${reason}`);
      }
    } finally {
      setUploading(false);
      setUploadStatus("");
    }
  };

  const archiveSelected = async () => {
    if (!vm.selectedDoc || vm.busy) return;
    try {
      await vm.archiveSelectedDocument();
      pushToast("success", "Archived reference record.");
    } catch (e: any) {
      const message = e?.message || "Archive failed";
      pushToast("error", `Archive failed: ${message}`);
    }
  };

  return {
    vm,
    tab,
    setTab,
    uploading,
    uploadStatus,
    toasts,
    counts,
    learningOutcomes,
    uploadFiles,
    archiveSelected,
  };
}

export type SpecsAdminViewModel = ReturnType<typeof useSpecsAdmin>;
