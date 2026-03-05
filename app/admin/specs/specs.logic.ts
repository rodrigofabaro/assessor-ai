"use client";

import { useMemo, useState } from "react";
import { put as putBlobClient } from "@vercel/blob/client";
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

const BLOB_MULTIPART_THRESHOLD_BYTES = 5 * 1024 * 1024;

type BlobTokenResponse = {
  clientToken: string;
  storagePath: string;
  storedFilename: string;
  maxBytes: number;
};

type BlobFinalizeResponse = {
  document?: { id: string };
  error?: string;
  message?: string;
  code?: string;
};

class UploadFlowError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function cleanErrorMessage(raw: unknown, fallback: string) {
  const msg = String(raw || "").trim();
  return msg || fallback;
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
  const isPearsonSuiteBulkImport =
    String((vm.selectedDoc?.sourceMeta as any)?.importSource || "") === "pearson-engineering-suite-2024";
  const pearsonCriteriaDescriptionsVerified = Boolean((vm.selectedDoc?.sourceMeta as any)?.criteriaDescriptionsVerified);
  const hidePearsonCriteriaDescriptions = isPearsonSuiteBulkImport && !pearsonCriteriaDescriptionsVerified;
  const learningOutcomes = useMemo(() => {
    const los = Array.isArray(extracted?.learningOutcomes) ? extracted.learningOutcomes : [];
    return los.map((lo: any) => {
      const criteria = Array.isArray(lo?.criteria) ? lo.criteria : [];
      return {
        ...lo,
        loCode: String(lo?.loCode || lo?.code || "").trim(),
        criteria: criteria
          .map((c: any) => {
            const acCode = String(c?.acCode || c?.code || "").trim().toUpperCase();
            if (!acCode) return null;
            return {
              ...c,
              acCode,
              gradeBand: c?.gradeBand || null,
              // Temporary safety guard for bulk-imported Pearson suite specs:
              // the legacy criteria parser can corrupt 3-column Pearson AC tables.
              description: hidePearsonCriteriaDescriptions ? "" : String(c?.description || "").trim(),
            };
          })
          .filter(Boolean),
      };
    });
  }, [extracted, hidePearsonCriteriaDescriptions]);

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
      const settled: UploadResult[] = [];
      let blobUploadEnabled: boolean | null = null;

      const uploadViaLegacyForm = async (file: File): Promise<UploadResult> => {
        const fd = new FormData();
        fd.set("type", "SPEC");
        fd.set("title", file.name);
        fd.set("version", "1");
        if (vm.docFramework.trim()) fd.set("framework", vm.docFramework.trim());
        if (vm.docCategory.trim()) fd.set("category", vm.docCategory.trim());
        fd.set("file", file);

        const res = await fetch("/api/reference-documents", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            fileName: file.name,
            ok: false,
            reason: cleanErrorMessage((data as any)?.error || (data as any)?.message, "Upload failed"),
          };
        }
        return { fileName: file.name, ok: true };
      };

      const uploadViaBlob = async (file: File): Promise<UploadResult> => {
        const tokenRes = await fetch("/api/reference-documents/blob-token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "SPEC",
            title: file.name,
            version: "1",
            framework: vm.docFramework.trim(),
            category: vm.docCategory.trim(),
            fileName: file.name,
            fileSize: file.size,
            contentType: file.type || "application/pdf",
          }),
        });

        const tokenJson = (await tokenRes.json().catch(() => ({}))) as Partial<BlobTokenResponse> & {
          error?: string;
          message?: string;
          code?: string;
        };

        if (!tokenRes.ok) {
          const errorCode = cleanErrorMessage(tokenJson.error || tokenJson.code, "BLOB_TOKEN_FAILED");
          if (errorCode === "CLIENT_BLOB_UPLOAD_DISABLED") {
            throw new UploadFlowError("Client Blob upload is disabled.", "CLIENT_BLOB_UPLOAD_DISABLED", tokenRes.status);
          }
          const reason = cleanErrorMessage(tokenJson.error || tokenJson.message, `Upload token failed (${tokenRes.status})`);
          throw new UploadFlowError(reason, errorCode, tokenRes.status);
        }

        if (!tokenJson.clientToken || !tokenJson.storagePath || !tokenJson.storedFilename) {
          throw new UploadFlowError("Upload token response is incomplete.");
        }

        const blob = await putBlobClient(tokenJson.storagePath, file, {
          token: tokenJson.clientToken,
          access: "private",
          multipart: file.size >= BLOB_MULTIPART_THRESHOLD_BYTES,
          contentType: "application/pdf",
        });

        const finalizeRes = await fetch("/api/reference-documents/blob-finalize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "SPEC",
            title: file.name,
            version: "1",
            framework: vm.docFramework.trim(),
            category: vm.docCategory.trim(),
            originalFilename: file.name,
            storedFilename: tokenJson.storedFilename,
            storagePath: tokenJson.storagePath,
            blobUrl: blob.url,
            blobPathname: blob.pathname,
            sizeBytes: file.size,
            contentType: blob.contentType || "application/pdf",
          }),
        });

        const finalizeJson = (await finalizeRes.json().catch(() => ({}))) as BlobFinalizeResponse;
        if (!finalizeRes.ok) {
          const reason = cleanErrorMessage(finalizeJson.error || finalizeJson.message, `Upload finalize failed (${finalizeRes.status})`);
          throw new UploadFlowError(reason, finalizeJson.code, finalizeRes.status);
        }

        return { fileName: file.name, ok: true };
      };

      for (let i = 0; i < valid.length; i += 1) {
        const file = valid[i];
        setUploadStatus(`Uploading ${i + 1}/${valid.length}: ${file.name}`);
        try {
          if (blobUploadEnabled !== false) {
            const result = await uploadViaBlob(file);
            blobUploadEnabled = true;
            settled.push(result);
            continue;
          }
        } catch (error) {
          const e = error as UploadFlowError;
          if (e.code === "CLIENT_BLOB_UPLOAD_DISABLED") {
            blobUploadEnabled = false;
            const fallbackResult = await uploadViaLegacyForm(file);
            settled.push(fallbackResult);
            continue;
          }
          settled.push({
            fileName: file.name,
            ok: false,
            reason: cleanErrorMessage(e?.message, "Upload failed"),
          });
          continue;
        }

        const fallbackResult = await uploadViaLegacyForm(file);
        settled.push(fallbackResult);
      }

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
    } catch {
      // errors already surfaced via mutation fetch + banner
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
    isPearsonSuiteBulkImport,
    pearsonCriteriaDescriptionsVerified,
    uploadFiles,
    archiveSelected,
  };
}

export type SpecsAdminViewModel = ReturnType<typeof useSpecsAdmin>;
