"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ui } from "@/components/ui/uiClasses";
import { TinyIcon } from "@/components/ui/TinyIcon";
import { useSpecsAdmin } from "./specs.logic";
import {
  SpecList,
  SpecViewer,
  UnitEditorPanel,
  SpecCatalogList,
  SpecMasterHealthBar,
  SpecVersionComparePanel,
  type SpecCatalogRow,
} from "./specs.ui";
import activeUnitsJson from "@/data/pearson/unit-lists/engineering-active-units-2024.json";
import extraUnitsJson from "@/data/pearson/unit-lists/engineering-extra-4005-4007.json";

function toneCls(tone: "success" | "error" | "warn"): string {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-rose-200 bg-rose-50 text-rose-900";
}

function normalizeSpace(v: unknown) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function normalizeUnitFamilyTitle(v: unknown) {
  return normalizeSpace(v)
    .toLowerCase()
    .replace(/\bpearson\s*set\b/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numericUnitCode(unitCode: string): number {
  const n = Number(String(unitCode || "").match(/\d{1,4}/)?.[0] || NaN);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function getSpecRowMetrics(doc: any) {
  const los = Array.isArray(doc?.extractedJson?.learningOutcomes) ? doc.extractedJson.learningOutcomes : [];
  const loCount = los.length;
  const criteriaCount = los.reduce((sum: number, lo: any) => sum + (Array.isArray(lo?.criteria) ? lo.criteria.length : 0), 0);
  return { loCount, criteriaCount };
}

export default function SpecsAdminPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const admin = useSpecsAdmin();
  const { vm } = admin;
  const tab = admin.tab;
  const setTab = admin.setTab;
  const uploading = admin.uploading;
  const uploadStatus = admin.uploadStatus;
  const toasts = admin.toasts;
  const uploadFiles = admin.uploadFiles;
  const archiveSelected = admin.archiveSelected;
  const counts = admin.counts;
  const learningOutcomes = admin.learningOutcomes;
  const filters = vm.filters;
  const setFilters = vm.setFilters;
  const selectedDocId = vm.selectedDocId;
  const setSelectedDocId = vm.setSelectedDocId;
  const refreshAll = vm.refreshAll;
  const extractSelected = vm.extractSelected;
  const lockSelected = vm.lockSelected;
  const reextractSelected = vm.reextractSelected;
  const [dragActive, setDragActive] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [quickFilter, setQuickFilter] = useState<"ALL" | "NEEDS_REVIEW" | "LOCKED" | "FAILED">("ALL");
  const [catalogQuickFilter, setCatalogQuickFilter] = useState<
    "ALL" | "ACTIVE_SET" | "FAVORITES" | "UNVERIFIED" | "PEARSON_IMPORT" | "PEARSON_SET_ONLY" | "ARCHIVED" | "FAILED"
  >("ALL");
  const [catalogExactCode, setCatalogExactCode] = useState(true);
  const [catalogNumericSort, setCatalogNumericSort] = useState(true);
  const [favoriteUnitCodes, setFavoriteUnitCodes] = useState<string[]>([]);
  const [catalogValidationReport, setCatalogValidationReport] = useState<null | {
    blockers: string[];
    warnings: string[];
    info: string[];
  }>(null);
  const [compareDocId, setCompareDocId] = useState("");
  const [headerBusy, setHeaderBusy] = useState<null | "refresh" | "extract" | "lock">(null);
  const [rowBusy, setRowBusy] = useState<Record<string, "extract" | "lock" | undefined>>({});
  const [hydratedFromUrl, setHydratedFromUrl] = useState(false);

  const selectedDoc = vm.selectedDoc;
  const extractionWarnings = Array.isArray(selectedDoc?.extractionWarnings)
    ? (selectedDoc?.extractionWarnings as Array<string | null | undefined>).filter(Boolean)
    : [];

  const errorMessage = vm.error || "";
  const errorDetail = errorMessage.includes("\n\n") ? errorMessage.split("\n\n").slice(1).join("\n\n") : "";

  const isMissingFile =
    /REFERENCE_FILE_MISSING/i.test(errorMessage) ||
    extractionWarnings.some((w) => /File not found|REFERENCE_FILE_MISSING/i.test(String(w)));

  const isLocked = !!selectedDoc?.lockedAt;
  const isExtractError =
    !!errorMessage && /extract|reference_extract_error/i.test(errorMessage) && !isMissingFile;
  const hasWarningDetails = extractionWarnings.length > 0;

  const dragTone = dragActive
    ? "border-sky-400 bg-sky-50 text-sky-900"
    : "border-dashed border-zinc-200 bg-zinc-50 text-zinc-600";

  const canExtract = !!selectedDoc && !vm.busy && !isLocked;
  const selectedLabel = selectedDoc?.title || "No document selected";
  const totalDocs = vm.documents.length;
  const lockedDocs = vm.documents.filter((d: any) => !!d.lockedAt || String(d.status || "").toUpperCase() === "LOCKED").length;
  const extractedDocs = vm.documents.filter((d: any) => ["EXTRACTED", "REVIEWED", "LOCKED"].includes(String(d.status || "").toUpperCase())).length;
  const failedDocs = vm.documents.filter((d: any) => String(d.status || "").toUpperCase() === "FAILED").length;
  const needsReviewDocs = vm.documents.filter((d: any) => {
    const s = String(d.status || "").toUpperCase();
    return !d.lockedAt && (s === "EXTRACTED" || s === "REVIEWED");
  }).length;
  const docsWithWarnings = vm.documents.filter((d: any) => Array.isArray(d.extractionWarnings) && d.extractionWarnings.length > 0).length;
  const docsMissingFiles = vm.documents.filter((d: any) => /File not found|REFERENCE_FILE_MISSING/i.test(JSON.stringify(d.extractionWarnings || ""))).length;

  const quickCounts = useMemo(() => {
    const all = vm.filteredDocuments.length;
    const needsReview = vm.filteredDocuments.filter((d: any) => {
      const s = String(d.status || "").toUpperCase();
      return !d.lockedAt && (s === "EXTRACTED" || s === "REVIEWED");
    }).length;
    const locked = vm.filteredDocuments.filter((d: any) => !!d.lockedAt || String(d.status || "").toUpperCase() === "LOCKED").length;
    const failed = vm.filteredDocuments.filter((d: any) => String(d.status || "").toUpperCase() === "FAILED").length;
    return { all, needsReview, locked, failed };
  }, [vm.filteredDocuments]);

  const visibleDocuments = useMemo(() => {
    if (quickFilter === "ALL") return vm.filteredDocuments;
    if (quickFilter === "FAILED") return vm.filteredDocuments.filter((d: any) => String(d.status || "").toUpperCase() === "FAILED");
    if (quickFilter === "LOCKED") return vm.filteredDocuments.filter((d: any) => !!d.lockedAt || String(d.status || "").toUpperCase() === "LOCKED");
    return vm.filteredDocuments.filter((d: any) => {
      const s = String(d.status || "").toUpperCase();
      return !d.lockedAt && (s === "EXTRACTED" || s === "REVIEWED");
    });
  }, [vm.filteredDocuments, quickFilter]);

  const expectedActiveCodes = useMemo(() => {
    const combined = [
      ...((activeUnitsJson as any)?.units || []),
      ...((extraUnitsJson as any)?.units || []),
    ];
    return Array.from(
      new Set(
        combined
          .map((u: any) => String(u?.code || "").trim())
          .filter((c: string) => /^\d{4}$/.test(c))
      )
    ).sort();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("specs.favoriteUnitCodes.v1");
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setFavoriteUnitCodes(parsed.map((v) => String(v)).filter(Boolean));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("specs.favoriteUnitCodes.v1", JSON.stringify(favoriteUnitCodes));
    } catch {
      // ignore
    }
  }, [favoriteUnitCodes]);

  const catalogRowsAll = useMemo<SpecCatalogRow[]>(() => {
    const docs = (vm.documents || []).filter((d: any) => d.type === "SPEC");
    const codeCounts = new Map<string, number>();
    const codeIssueCounts = new Map<string, number>();
    const familyCounts = new Map<string, number>();
    const familyCodeSets = new Map<string, Set<string>>();
    for (const d of docs) {
      const unitCode = String((d.sourceMeta as any)?.unitCode || d.extractedJson?.unit?.unitCode || "").trim();
      const unitTitle = String((d.sourceMeta as any)?.unitTitle || d.extractedJson?.unit?.unitTitle || "").trim();
      const issueLabel = normalizeSpace(
        (d.sourceMeta as any)?.specVersionLabel ||
          (d.sourceMeta as any)?.specIssue ||
          d.extractedJson?.unit?.specVersionLabel ||
          d.extractedJson?.unit?.specIssue ||
          ""
      ).toLowerCase();
      const familyKey = normalizeUnitFamilyTitle(unitTitle || d.title || unitCode);
      if (!unitCode) continue;
      codeCounts.set(unitCode, (codeCounts.get(unitCode) || 0) + 1);
      const key = `${unitCode}::${issueLabel || "no-issue"}`;
      codeIssueCounts.set(key, (codeIssueCounts.get(key) || 0) + 1);
      familyCounts.set(familyKey, (familyCounts.get(familyKey) || 0) + 1);
      if (!familyCodeSets.has(familyKey)) familyCodeSets.set(familyKey, new Set<string>());
      familyCodeSets.get(familyKey)!.add(unitCode);
    }
    return docs.map((doc: any) => {
      const unitCode = String((doc.sourceMeta as any)?.unitCode || doc.extractedJson?.unit?.unitCode || "").trim();
      const unitTitle = String((doc.sourceMeta as any)?.unitTitle || doc.extractedJson?.unit?.unitTitle || "").trim();
      const issueLabel = String(
        (doc.sourceMeta as any)?.specVersionLabel ||
          (doc.sourceMeta as any)?.specIssue ||
          doc.extractedJson?.unit?.specVersionLabel ||
          doc.extractedJson?.unit?.specIssue ||
          ""
      ).trim();
      const importSource = String((doc.sourceMeta as any)?.importSource || "");
      const versionFamilyKey = normalizeUnitFamilyTitle(unitTitle || doc.title || unitCode);
      const isPearsonImport = importSource === "pearson-engineering-suite-2024";
      const pearsonCriteriaVerified = !isPearsonImport || !!(doc.sourceMeta as any)?.criteriaDescriptionsVerified;
      const { loCount, criteriaCount } = getSpecRowMetrics(doc);
      const titleHay = `${doc.title || ""} ${unitTitle}`.toLowerCase();
      const isPearsonSet = /\bpearson[- ]set\b/i.test(titleHay);
      const archived = !!(doc.sourceMeta as any)?.archived;
      const isFavorite = !!unitCode && favoriteUnitCodes.includes(unitCode);
      const isActiveSet = isPearsonImport && !!unitCode && expectedActiveCodes.includes(unitCode);
      return {
        doc,
        unitCode,
        unitTitle,
        issueLabel,
        loCount,
        criteriaCount,
        importSource,
        isPearsonImport,
        pearsonCriteriaVerified,
        isPearsonSet,
        archived,
        versionCountForCode: unitCode ? codeCounts.get(unitCode) || 0 : 0,
        sameIssueVersionCountForCode: unitCode
          ? codeIssueCounts.get(`${unitCode}::${normalizeSpace(issueLabel).toLowerCase() || "no-issue"}`) || 0
          : 0,
        versionFamilyCount: versionFamilyKey ? familyCounts.get(versionFamilyKey) || 0 : 0,
        versionFamilyDistinctCodeCount: versionFamilyKey ? (familyCodeSets.get(versionFamilyKey)?.size || 0) : 0,
        versionFamilyKey,
        isFavorite,
        isActiveSet,
      };
    });
  }, [vm.documents, favoriteUnitCodes, expectedActiveCodes]);

  const catalogQuickCounts = useMemo(() => {
    const base = catalogRowsAll;
    const count = (fn: (r: SpecCatalogRow) => boolean) => base.filter(fn).length;
    return {
      ALL: count((r) => !!r.doc.lockedAt || String(r.doc.status || "").toUpperCase() === "LOCKED"),
      ACTIVE_SET: count((r) => r.isActiveSet && (!!r.doc.lockedAt || String(r.doc.status).toUpperCase() === "LOCKED")),
      FAVORITES: count((r) => r.isFavorite),
      UNVERIFIED: count((r) => r.isPearsonImport && !r.pearsonCriteriaVerified),
      PEARSON_IMPORT: count((r) => r.isPearsonImport),
      PEARSON_SET_ONLY: count((r) => r.isPearsonSet),
      ARCHIVED: count((r) => r.archived),
      FAILED: count((r) => String(r.doc.status || "").toUpperCase() === "FAILED"),
    };
  }, [catalogRowsAll]);

  const catalogHealth = useMemo(() => {
    const locked = catalogRowsAll.filter((r) => !!r.doc.lockedAt || String(r.doc.status || "").toUpperCase() === "LOCKED");
    const pearsonLocked = locked.filter((r) => r.isPearsonImport);
    const activeLockedCodes = new Set(locked.filter((r) => r.isActiveSet).map((r) => r.unitCode));
    const multiVersionFamilies = Array.from(
      new Set(
        locked
          .filter((r) => r.versionFamilyCount > 1)
          .map((r) => r.unitTitle || r.unitCode)
      )
    ).sort((a, b) => a.localeCompare(b));
    const sameIssueConflictKeys = Array.from(
      new Set(
        locked
          .filter((r) => r.unitCode && r.sameIssueVersionCountForCode > 1)
          .map((r) => `${r.unitCode}${r.issueLabel ? ` (${r.issueLabel})` : ""}`)
      )
    ).sort();
    return {
      lockedCount: locked.length,
      activeSetCount: activeLockedCodes.size,
      expectedActiveSetCount: expectedActiveCodes.length,
      missingActiveSetCount: Math.max(0, expectedActiveCodes.length - activeLockedCodes.size),
      unverifiedPearsonCount: pearsonLocked.filter((r) => !r.pearsonCriteriaVerified).length,
      multiVersionFamilyCount: multiVersionFamilies.length,
      multiVersionFamilies,
      sameIssueConflictCount: sameIssueConflictKeys.length,
      sameIssueConflictKeys,
      archivedCount: locked.filter((r) => r.archived).length,
    };
  }, [catalogRowsAll, expectedActiveCodes]);

  const catalogRowsFiltered = useMemo(() => {
    const q = String(filters.q || "").trim();
    const qLower = q.toLowerCase();
    const exactCodeQuery = /^\d{1,4}$/.test(q) ? q : "";
    let list = [...catalogRowsAll];
    list = list.filter((r) => {
      switch (catalogQuickFilter) {
        case "ALL":
          return !!r.doc.lockedAt || String(r.doc.status || "").toUpperCase() === "LOCKED";
        case "ACTIVE_SET":
          return r.isActiveSet && (!!r.doc.lockedAt || String(r.doc.status || "").toUpperCase() === "LOCKED");
        case "FAVORITES":
          return r.isFavorite;
        case "UNVERIFIED":
          return r.isPearsonImport && !r.pearsonCriteriaVerified;
        case "PEARSON_IMPORT":
          return r.isPearsonImport;
        case "PEARSON_SET_ONLY":
          return r.isPearsonSet;
        case "ARCHIVED":
          return r.archived;
        case "FAILED":
          return String(r.doc.status || "").toUpperCase() === "FAILED";
        default:
          return true;
      }
    });
    if (q) {
      list = list.filter((r) => {
        if (onlyString(catalogExactCode) && exactCodeQuery) {
          return r.unitCode === exactCodeQuery;
        }
        const hay = `${r.unitCode} ${r.unitTitle} ${r.doc.title || ""} ${r.issueLabel} ${r.importSource}`.toLowerCase();
        return hay.includes(qLower);
      });
    }
    list.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      if (a.isActiveSet !== b.isActiveSet) return a.isActiveSet ? -1 : 1;
      if (catalogNumericSort) {
        const codeCmp = numericUnitCode(a.unitCode) - numericUnitCode(b.unitCode);
        if (codeCmp !== 0) return codeCmp;
      }
      return (
        String(a.unitCode || "").localeCompare(String(b.unitCode || "")) ||
        String(a.unitTitle || "").localeCompare(String(b.unitTitle || "")) ||
        String(a.issueLabel || "").localeCompare(String(b.issueLabel || ""))
      );
    });
    return list;
  }, [catalogRowsAll, catalogQuickFilter, filters.q, catalogExactCode, catalogNumericSort]);

  const selectedCatalogRow = useMemo(
    () => catalogRowsAll.find((r) => r.doc.id === selectedDocId) || null,
    [catalogRowsAll, selectedDocId]
  );

  const compareCandidates = useMemo(() => {
    if (!selectedCatalogRow) return [];
    return catalogRowsAll.filter((r) => r.versionFamilyKey === selectedCatalogRow.versionFamilyKey && r.doc.id !== selectedCatalogRow.doc.id);
  }, [catalogRowsAll, selectedCatalogRow]);

  useEffect(() => {
    if (!compareCandidates.find((c) => c.doc.id === compareDocId)) {
      setCompareDocId("");
    }
  }, [compareCandidates, compareDocId]);

  function onlyString(v: boolean) {
    return !!v;
  }

  const toggleFavoriteUnitCode = useCallback((unitCode: string) => {
    if (!unitCode) return;
    setFavoriteUnitCodes((prev) =>
      prev.includes(unitCode) ? prev.filter((c) => c !== unitCode) : [...prev, unitCode]
    );
  }, []);

  const runCatalogValidation = useCallback(() => {
    const blockers: string[] = [];
    const warnings: string[] = [];
    const info: string[] = [];
    if (catalogHealth.missingActiveSetCount > 0) blockers.push(`Missing ${catalogHealth.missingActiveSetCount} active-set unit(s) from locked catalog.`);
    if (catalogHealth.unverifiedPearsonCount > 0) blockers.push(`${catalogHealth.unverifiedPearsonCount} Pearson spec(s) have unverified criterion descriptions.`);
    if (catalogHealth.sameIssueConflictCount > 0) warnings.push(`Same-code + same-issue conflicts detected: ${catalogHealth.sameIssueConflictKeys.join(", ")}.`);
    const emptyRows = catalogRowsAll.filter((r) => (r.doc.lockedAt || String(r.doc.status).toUpperCase() === "LOCKED") && (r.loCount === 0 || r.criteriaCount === 0));
    if (emptyRows.length) blockers.push(`${emptyRows.length} locked spec(s) have empty LO/AC counts.`);
    info.push(`Locked specs: ${catalogHealth.lockedCount}`);
    info.push(`Expected active set: ${catalogHealth.expectedActiveSetCount}`);
    if (catalogHealth.multiVersionFamilyCount > 0) info.push(`Multi-version unit families: ${catalogHealth.multiVersionFamilies.join(", ")}.`);
    setCatalogValidationReport({ blockers, warnings, info });
  }, [catalogHealth, catalogRowsAll]);

  const exportCatalogRegistry = useCallback(() => {
    const payload = {
      generatedAt: new Date().toISOString(),
      rows: catalogRowsAll.map((r) => ({
        documentId: r.doc.id,
        status: r.doc.status,
        lockedAt: r.doc.lockedAt || null,
        unitCode: r.unitCode || null,
        unitTitle: r.unitTitle || null,
        issueLabel: r.issueLabel || null,
        loCount: r.loCount,
        criteriaCount: r.criteriaCount,
        importSource: r.importSource || null,
        pearsonCriteriaVerified: r.pearsonCriteriaVerified,
        isPearsonSet: r.isPearsonSet,
        archived: r.archived,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `spec-library-registry-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [catalogRowsAll]);

  const copyPearsonRepairCommand = useCallback(async () => {
    const cmd = "node scripts/repair-pearson-imported-spec-criteria.cjs && node scripts/lock-imported-pearson-specs.cjs";
    try {
      await navigator.clipboard.writeText(cmd);
      window.alert("Copied Pearson repair command.");
    } catch {
      window.prompt("Copy Pearson repair command:", cmd);
    }
  }, []);

  const handleExtract = useCallback(async (docId?: string) => {
    const id = docId || selectedDocId;
    if (!id) return;
    if (docId) setRowBusy((prev) => ({ ...prev, [id]: "extract" }));
    if (!docId) setHeaderBusy("extract");
    try {
      if (selectedDocId !== id) setSelectedDocId(id);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await extractSelected();
    } finally {
      if (docId) setRowBusy((prev) => ({ ...prev, [id]: undefined }));
      if (!docId) setHeaderBusy(null);
    }
  }, [extractSelected, selectedDocId, setSelectedDocId]);

  const handleLock = useCallback(async (docId?: string) => {
    const id = docId || selectedDocId;
    if (!id) return;
    if (docId) setRowBusy((prev) => ({ ...prev, [id]: "lock" }));
    if (!docId) setHeaderBusy("lock");
    try {
      if (selectedDocId !== id) setSelectedDocId(id);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await lockSelected();
    } finally {
      if (docId) setRowBusy((prev) => ({ ...prev, [id]: undefined }));
      if (!docId) setHeaderBusy(null);
    }
  }, [lockSelected, selectedDocId, setSelectedDocId]);

  const handleRefresh = useCallback(async () => {
    setHeaderBusy("refresh");
    try {
      await refreshAll();
    } finally {
      setHeaderBusy(null);
    }
  }, [refreshAll]);

  const nextAction = useMemo(() => {
    if (tab === "library") {
      if (catalogHealth.unverifiedPearsonCount > 0) return `Repair ${catalogHealth.unverifiedPearsonCount} Pearson spec${catalogHealth.unverifiedPearsonCount === 1 ? "" : "s"} with unverified criteria text.`;
      if (catalogHealth.missingActiveSetCount > 0) return `Import and lock ${catalogHealth.missingActiveSetCount} missing active-set spec${catalogHealth.missingActiveSetCount === 1 ? "" : "s"}.`;
      if (catalogHealth.sameIssueConflictCount > 0) return "Review same-code/same-issue conflicts and keep only the intended version active.";
      if (catalogHealth.multiVersionFamilyCount > 0) return "Multiple versions exist for some unit families (including code changes across frameworks). Use version compare to confirm the intended grading version.";
      return "Catalog is healthy. Use filters to review active units and version changes.";
    }
    if (failedDocs > 0) return "Resolve failed specs first to restore extraction health.";
    if (needsReviewDocs > 0) return `Review and lock ${needsReviewDocs} extracted spec${needsReviewDocs === 1 ? "" : "s"}.`;
    if (totalDocs === 0) return "Upload your first spec to start building the reference register.";
    return "Workspace is healthy. Continue reviewing and locking new uploads.";
  }, [failedDocs, needsReviewDocs, totalDocs, tab, catalogHealth]);

  const nextFocusDocId = useMemo(() => {
    const failed = visibleDocuments.find((d: any) => String(d.status || "").toUpperCase() === "FAILED");
    if (failed) return failed.id;
    const pending = visibleDocuments.find((d: any) => {
      const s = String(d.status || "").toUpperCase();
      return !d.lockedAt && (s === "EXTRACTED" || s === "REVIEWED");
    });
    if (pending) return pending.id;
    return visibleDocuments[0]?.id || "";
  }, [visibleDocuments]);

  // Persist tab and filters in URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hydratedFromUrl) {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      const q = params.get("q");
      const status = params.get("status");
      const quick = params.get("quick");
      if (tab === "library" || tab === "extract") setTab(tab);
      if (q !== null || status !== null) {
        setFilters({
          ...filters,
          q: q ?? filters.q,
          status: (status ?? filters.status) as any,
        });
      }
      if (tab === "extract" && (quick === "ALL" || quick === "NEEDS_REVIEW" || quick === "LOCKED" || quick === "FAILED")) setQuickFilter(quick);
      if (
        tab === "library" &&
        (quick === "ALL" || quick === "ACTIVE_SET" || quick === "FAVORITES" || quick === "UNVERIFIED" || quick === "PEARSON_IMPORT" || quick === "PEARSON_SET_ONLY" || quick === "ARCHIVED" || quick === "FAILED")
      ) {
        setCatalogQuickFilter(quick as any);
      }
      setHydratedFromUrl(true);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    if (filters.q) params.set("q", filters.q); else params.delete("q");
    if (filters.status) params.set("status", filters.status); else params.delete("status");
    params.set("quick", tab === "library" ? catalogQuickFilter : quickFilter);
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", next);
  }, [filters, hydratedFromUrl, quickFilter, catalogQuickFilter, setFilters, setTab, tab]);

  // Keyboard flow: / search, j/k move, e extract, l lock.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = String((e.target as HTMLElement | null)?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (!visibleDocuments.length) return;
      const idx = Math.max(0, visibleDocuments.findIndex((d: any) => d.id === selectedDocId));
      if (e.key.toLowerCase() === "j") {
        const next = visibleDocuments[Math.min(visibleDocuments.length - 1, idx + 1)];
        if (next) setSelectedDocId(next.id);
      } else if (e.key.toLowerCase() === "k") {
        const prev = visibleDocuments[Math.max(0, idx - 1)];
        if (prev) setSelectedDocId(prev.id);
      } else if (e.key.toLowerCase() === "e") {
        if (selectedDocId) void handleExtract(selectedDocId);
      } else if (e.key.toLowerCase() === "l") {
        if (selectedDocId) void handleLock(selectedDocId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleExtract, handleLock, selectedDocId, setSelectedDocId, visibleDocuments]);

  // Auto-collapse upload after successful upload cycle.
  const prevUploadingRef = useRef(false);
  useEffect(() => {
    if (prevUploadingRef.current && !uploading && !vm.error) setUploadOpen(false);
    prevUploadingRef.current = uploading;
  }, [uploading, vm.error]);

  async function handleReextractWithGuard() {
    if (!vm.selectedDoc) return;
    if (vm.selectedDoc.lockedAt) {
      const typed = window.prompt("This spec is locked. Type REEXTRACT to confirm force re-extract.");
      if (typed !== "REEXTRACT") return;
    }
    await reextractSelected();
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
      <div className="grid min-w-0 gap-4">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        onChange={(e) => {
          uploadFiles(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />

      <div className="pointer-events-none fixed right-4 top-4 z-50 grid gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={"pointer-events-auto rounded-xl border px-3 py-2 text-sm shadow-sm " + toneCls(t.tone)}>
            {t.text}
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 via-white to-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-tight text-zinc-900">
              <TinyIcon name="reference" className="h-3.5 w-3.5" />
              Specifications
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-900">
              <TinyIcon name="submissions" className="h-3 w-3" />
              Register
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={!!vm.busy}
              className={ui.btnSecondary + " disabled:cursor-not-allowed disabled:opacity-60"}
            >
              {headerBusy === "refresh" ? "Refreshing..." : "Refresh"}
            </button>
            {tab === "extract" ? (
              <>
                <button
                  type="button"
                  onClick={() => setUploadOpen((prev) => !prev)}
                  disabled={uploading}
                  className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}
                >
                  {uploadOpen ? "Hide upload" : "Upload specs"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExtract()}
                  disabled={!canExtract}
                  title={!vm.selectedDoc ? "Select a specification first." : isLocked ? "Selected specification is locked." : ""}
                  className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}
                >
                  {headerBusy === "extract" ? "Extracting..." : "Extract selected"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setTab("extract")}
                className={ui.btnPrimary}
              >
                Open extraction inbox
              </button>
            )}
            <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
              <TinyIcon name="status" className="mr-1 h-3 w-3" />
              {uploading ? uploadStatus : vm.busy ? `Processing: ${vm.busy}` : "Ready"}
            </span>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {[
            ["Total", totalDocs],
            ["Extracted", extractedDocs],
            ["Needs review", needsReviewDocs],
            ["Locked", lockedDocs],
            ["Failed", failedDocs],
            ["Health", `${docsWithWarnings} warnings · ${docsMissingFiles} missing`],
          ].map(([label, value]) => (
            <span
              key={String(label)}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-semibold text-zinc-700"
            >
              <span className="text-zinc-500">{label}</span>
              <span className="text-zinc-900">{value}</span>
            </span>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          <span className="font-semibold text-zinc-900">Next best action:</span> {nextAction}
          {nextFocusDocId ? (
            <button
              type="button"
              onClick={() => vm.setSelectedDocId(nextFocusDocId)}
              className="ml-2 inline-flex rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
            >
              Focus item
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("library")}
            className={
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
              (tab === "library" ? "bg-cyan-700 text-white" : "text-zinc-700 hover:bg-zinc-100")
            }
          >
            Library Catalog
          </button>
          <button
            type="button"
            onClick={() => setTab("extract")}
            className={
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
              (tab === "extract" ? "bg-cyan-700 text-white" : "text-zinc-700 hover:bg-zinc-100")
            }
          >
            Extraction Inbox
          </button>
        </div>
      </section>

      {tab === "extract" ? (
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Upload specifications</h2>
            <p className="mt-1 text-xs text-zinc-500">Drag and drop PDF files or use file selection.</p>
          </div>
          <div className="flex items-center gap-2">
            {uploadOpen ? (
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Collapse
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setUploadOpen((prev) => !prev)}
              disabled={uploading}
              className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}
            >
              Upload files
            </button>
          </div>
        </div>

        {uploadOpen ? (
          <div className="mt-4 grid gap-3">
            <div
              className={"grid gap-2 rounded-2xl border-2 p-6 text-sm transition " + dragTone}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
                const files = Array.from(e.dataTransfer?.files || []);
                uploadFiles(files);
              }}
            >
              <div className="text-sm font-semibold text-zinc-900">Drop PDF files here</div>
              <div className="text-xs text-zinc-600">Files upload immediately and appear in the specification list.</div>
              <div className="text-xs text-zinc-500">Accepted format: PDF · Multiple files supported</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className={ui.btnSecondary + " disabled:cursor-not-allowed disabled:opacity-60"}
              >
                Choose files
              </button>
              <span className="text-xs text-zinc-500">Uploads start immediately after selection.</span>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            Upload panel collapsed. Click &quot;Upload files&quot; to add specifications.
          </div>
        )}
      </section>
      ) : (
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Catalog mode</div>
            <div className="mt-1 text-xs text-zinc-600">Upload/extract controls are hidden to keep the specs master easy to review.</div>
          </div>
          <button
            type="button"
            onClick={() => setTab("extract")}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Go to extraction inbox
          </button>
        </div>
      </section>
      )}

      {tab === "library" ? (
        <section className="grid min-w-0 gap-4">
          <SpecMasterHealthBar
            health={catalogHealth}
            onValidate={runCatalogValidation}
            onExport={exportCatalogRegistry}
            onCopyRepairCommand={copyPearsonRepairCommand}
          />

          {catalogValidationReport ? (
            <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-zinc-900">Library integrity audit</div>
                <button
                  type="button"
                  onClick={() => setCatalogValidationReport(null)}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Clear
                </button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                  <div className="text-xs font-semibold uppercase tracking-wide">Blockers ({catalogValidationReport.blockers.length})</div>
                  {catalogValidationReport.blockers.length ? (
                    <ul className="mt-2 list-disc pl-4 text-xs">
                      {catalogValidationReport.blockers.map((x, i) => <li key={`b-${i}`}>{x}</li>)}
                    </ul>
                  ) : <div className="mt-2 text-xs">None</div>}
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="text-xs font-semibold uppercase tracking-wide">Warnings ({catalogValidationReport.warnings.length})</div>
                  {catalogValidationReport.warnings.length ? (
                    <ul className="mt-2 list-disc pl-4 text-xs">
                      {catalogValidationReport.warnings.map((x, i) => <li key={`w-${i}`}>{x}</li>)}
                    </ul>
                  ) : <div className="mt-2 text-xs">None</div>}
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                  <div className="text-xs font-semibold uppercase tracking-wide">Info</div>
                  <ul className="mt-2 list-disc pl-4 text-xs">
                    {catalogValidationReport.info.map((x, i) => <li key={`i-${i}`}>{x}</li>)}
                  </ul>
                </div>
              </div>
            </article>
          ) : null}

          <section className="grid min-w-0 gap-4 xl:grid-cols-[420px_1fr]">
            <SpecCatalogList
              rows={catalogRowsFiltered}
              selectedDocId={selectedDocId}
              onSelect={setSelectedDocId}
              q={filters.q}
              onQueryChange={(next) => setFilters({ ...filters, q: next })}
              quickFilter={catalogQuickFilter}
              onQuickFilterChange={setCatalogQuickFilter}
              quickCounts={catalogQuickCounts as any}
              onlyExactCode={catalogExactCode}
              setOnlyExactCode={setCatalogExactCode}
              onlyNumericSort={catalogNumericSort}
              setOnlyNumericSort={setCatalogNumericSort}
              onToggleFavorite={toggleFavoriteUnitCode}
            />
            <div className="grid min-w-0 gap-4">
              <UnitEditorPanel selectedDoc={vm.selectedDoc} learningOutcomes={learningOutcomes} />
              <SpecVersionComparePanel
                selected={selectedCatalogRow}
                candidates={compareCandidates}
                compareId={compareDocId}
                onSelectCompareId={setCompareDocId}
              />
              <SpecViewer selectedDoc={vm.selectedDoc} learningOutcomes={learningOutcomes} />
            </div>
          </section>
        </section>
      ) : (
        <section className="grid min-w-0 gap-4">
          <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-zinc-600">
                Selected document: <span className="font-semibold text-zinc-900">{selectedLabel}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
              <button type="button" onClick={() => vm.refreshAll()} className={ui.btnSecondary}>
                {headerBusy === "refresh" ? "Refreshing..." : "Refresh"}
              </button>
              <button
                type="button"
                onClick={() => void handleExtract()}
                disabled={!canExtract}
                title={isLocked ? "This document is locked. Use Force re-extract to update extracted data." : ""}
                className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}
              >
                {headerBusy === "extract" ? "Extracting..." : "Extract"}
              </button>
              <button
                type="button"
                onClick={() => void handleReextractWithGuard()}
                disabled={!vm.selectedDoc || !!vm.busy}
                className={ui.btnSecondary + " disabled:cursor-not-allowed disabled:opacity-50"}
              >
                {isLocked ? "Force re-extract" : "Re-extract"}
              </button>
              <button
                type="button"
                onClick={() => void handleLock()}
                disabled={!vm.selectedDoc || !!vm.busy}
                className={ui.btnPrimary + " disabled:cursor-not-allowed disabled:bg-zinc-300"}
              >
                {headerBusy === "lock" ? "Locking..." : "Lock"}
              </button>
              </div>
            </div>

            {isLocked ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                This document is locked. Use <span className="font-semibold">Force re-extract</span> to update extracted data.
              </div>
            ) : null}

            {isMissingFile ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                <div className="font-semibold">File missing for {selectedDoc?.title || "this document"}.</div>
                <div className="mt-1 text-xs text-rose-900/80">
                  The stored file path is invalid or the file was moved/deleted.
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-900 hover:bg-rose-100"
                  >
                    Re-upload to replace file
                  </button>
                  <button
                    type="button"
                    onClick={archiveSelected}
                    disabled={!!vm.busy}
                    className={
                      "rounded-xl border px-3 py-2 text-xs font-semibold " +
                      (vm.busy
                        ? "cursor-not-allowed border-rose-200 bg-rose-100 text-rose-300"
                        : "border-rose-200 bg-white text-rose-900 hover:bg-rose-100")
                    }
                  >
                    Remove/Archive this record
                  </button>
                </div>
              </div>
            ) : null}

            {isExtractError ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                <div className="font-semibold">Extraction error</div>
                <div className="mt-1 text-xs text-rose-900/80">
                  {errorMessage.split("\n\n")[0]}
                </div>
                {errorDetail ? (
                  <details className="mt-2 text-xs text-rose-900/80">
                    <summary className="cursor-pointer font-semibold">Details</summary>
                    <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed">{errorDetail}</pre>
                  </details>
                ) : null}
              </div>
            ) : null}

            {!isMissingFile && !isExtractError && selectedDoc?.status === "FAILED" && hasWarningDetails ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                <div className="font-semibold">Extraction failed</div>
                <div className="mt-2 text-xs text-rose-900/80">
                  Last extracted data is still shown below.
                </div>
                <details className="mt-2 text-xs text-rose-900/80">
                  <summary className="cursor-pointer font-semibold">Details</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed">
                    {extractionWarnings.join("\n")}
                  </pre>
                </details>
              </div>
            ) : null}
          </article>

          <section className="grid min-w-0 gap-4 xl:grid-cols-[360px_1fr]">
            <SpecList
              documents={visibleDocuments}
              selectedDocId={selectedDocId}
              onSelect={setSelectedDocId}
              onExtract={(id) => void handleExtract(id)}
              onLock={(id) => void handleLock(id)}
              q={filters.q}
              status={filters.status}
              quickFilter={quickFilter}
              quickCounts={quickCounts}
              rowBusy={rowBusy}
              onQueryChange={(next) => setFilters({ ...filters, q: next })}
              onStatusChange={(next) => setFilters({ ...filters, status: (next as any) || "" })}
              onQuickFilterChange={setQuickFilter}
              counts={{ shown: visibleDocuments.length, total: counts.total }}
              searchInputRef={searchInputRef}
            />
            <div className="grid min-w-0 gap-4">
              <UnitEditorPanel selectedDoc={vm.selectedDoc} learningOutcomes={learningOutcomes} />
              <SpecViewer selectedDoc={vm.selectedDoc} learningOutcomes={learningOutcomes} />
            </div>
          </section>
        </section>
      )}
      </div>
    </div>
  );
}
