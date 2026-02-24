"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { jsonFetch } from "./api";
import type { PaginatedResponse, SubmissionRow } from "./types";
import { groupByDay } from "./logic";

export type Timeframe = "today" | "week" | "all";
export type LaneKey = "AUTO_READY" | "NEEDS_HUMAN" | "BLOCKED" | "COMPLETED";
export type LaneFilter = LaneKey | "ALL" | "QA_REVIEW";
export type SortBy = "uploadedAt" | "grade" | "status" | "student";
export type SortDir = "asc" | "desc";

type LaneMeta = {
  key: LaneKey;
  label: string;
  description: string;
};

export type LaneGroup = LaneMeta & {
  rows: SubmissionRow[];
  dayGroups: Array<[string, SubmissionRow[]]>;
};

const LANE_ORDER: LaneMeta[] = [
  { key: "AUTO_READY", label: "Auto-Ready", description: "Can run automatically without operator intervention." },
  { key: "NEEDS_HUMAN", label: "Needs Human", description: "Needs a manual decision or missing linkage." },
  { key: "BLOCKED", label: "Blocked", description: "Hard blockers such as OCR/failure must be resolved first." },
  { key: "COMPLETED", label: "Completed", description: "Assessment complete and outputs available." },
];

const DEFAULT_PAGE_SIZE = 40;

function rankGrade(value: string) {
  const x = String(value || "").toUpperCase();
  if (x === "DISTINCTION") return 5;
  if (x === "MERIT") return 4;
  if (x === "PASS") return 3;
  if (x === "PASS_ON_RESUBMISSION") return 2;
  if (x === "REFER") return 1;
  return 0;
}

export function useSubmissionsList() {
  const [items, setItems] = useState<SubmissionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");
  const [msg, setMsg] = useState<string>("");
  const [hydratedFromUrl, setHydratedFromUrl] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [readyOnly, setReadyOnly] = useState(false);
  const [laneFilter, setLaneFilter] = useState<LaneFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortBy>("uploadedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [handoffOnly, setHandoffOnly] = useState(false);
  const [qaReviewOnly, setQaReviewOnly] = useState(false);
  const hasAppliedInitialFilterState = useRef(false);

  function refresh() {
    setRefreshNonce((n) => n + 1);
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (typeof window === "undefined" || hydratedFromUrl) return;
    const params = new URLSearchParams(window.location.search);
    const asBool = (v: string | null) => v === "1" || String(v || "").toLowerCase() === "true";
    const laneRaw = String(params.get("lane") || "").toUpperCase();
    const timeframeRaw = String(params.get("timeframe") || "").toLowerCase();
    const sortByRaw = String(params.get("sortBy") || "");
    const sortDirRaw = String(params.get("sortDir") || "").toLowerCase();

    if (asBool(params.get("unlinked"))) setUnlinkedOnly(true);
    if (asBool(params.get("ready"))) setReadyOnly(true);
    if (asBool(params.get("handoff"))) setHandoffOnly(true);
    if (asBool(params.get("qaOnly"))) setQaReviewOnly(true);

    const q = params.get("q");
    const status = params.get("status");
    const pageRaw = Number(params.get("page") || 1);
    const pageSizeRaw = Number(params.get("pageSize") || DEFAULT_PAGE_SIZE);
    if (q !== null) {
      setQuery(q);
      setDebouncedQuery(q.trim());
    }
    if (status !== null) setStatusFilter(status);
    if (Number.isFinite(pageRaw) && pageRaw >= 1) setPage(Math.floor(pageRaw));
    if (Number.isFinite(pageSizeRaw) && pageSizeRaw >= 10 && pageSizeRaw <= 200) setPageSize(Math.floor(pageSizeRaw));

    if (laneRaw === "ALL" || laneRaw === "QA_REVIEW" || laneRaw === "AUTO_READY" || laneRaw === "NEEDS_HUMAN" || laneRaw === "BLOCKED" || laneRaw === "COMPLETED") {
      setLaneFilter(laneRaw as LaneFilter);
    }
    if (timeframeRaw === "today" || timeframeRaw === "week" || timeframeRaw === "all") setTimeframe(timeframeRaw as Timeframe);
    if (sortByRaw === "uploadedAt" || sortByRaw === "student" || sortByRaw === "status" || sortByRaw === "grade") {
      setSortBy(sortByRaw as SortBy);
    }
    if (sortDirRaw === "asc" || sortDirRaw === "desc") setSortDir(sortDirRaw as SortDir);

    setHydratedFromUrl(true);
  }, [hydratedFromUrl]);

  useEffect(() => {
    if (!hydratedFromUrl) return;
    if (!hasAppliedInitialFilterState.current) {
      hasAppliedInitialFilterState.current = true;
      return;
    }
    setPage(1);
  }, [unlinkedOnly, timeframe, statusFilter, debouncedQuery, pageSize, laneFilter, readyOnly, handoffOnly, qaReviewOnly, sortBy, sortDir, hydratedFromUrl]);

  useEffect(() => {
    if (!hydratedFromUrl) return;
    let cancelled = false;

    async function run() {
      setBusy(true);
      setErr("");
      setMsg("");
      try {
        const requiresServerQa = laneFilter === "QA_REVIEW" || qaReviewOnly;
        const params = new URLSearchParams();
        params.set("view", "workspace");
        params.set("qa", requiresServerQa ? "1" : "0");
        // Keep the list payload lightweight; feedback is fetched on demand by copy actions.
        params.set("includeFeedback", "0");
        params.set("paginate", "1");
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));
        params.set("timeframe", timeframe);
        params.set("sortBy", sortBy);
        params.set("sortDir", sortDir);
        if (debouncedQuery) params.set("q", debouncedQuery);
        if (statusFilter) params.set("status", statusFilter);
        if (unlinkedOnly) params.set("unlinked", "1");
        if (laneFilter !== "ALL") params.set("lane", laneFilter);
        if (readyOnly) params.set("ready", "1");
        if (handoffOnly) params.set("handoff", "1");
        if (qaReviewOnly) params.set("qaOnly", "1");
        const payload = await jsonFetch<PaginatedResponse<SubmissionRow>>(`/api/submissions?${params.toString()}`, { cache: "no-store" });
        if (cancelled) return;
        const nextItems = Array.isArray(payload?.items) ? payload.items : [];
        setItems(nextItems);
        const info = payload?.pageInfo || {
          page,
          pageSize,
          totalItems: nextItems.length,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        };
        setTotalItems(Math.max(0, Number(info.totalItems || 0)));
        setTotalPages(Math.max(1, Number(info.totalPages || 1)));
      } catch (e: any) {
        if (!cancelled) {
          setItems([]);
          setTotalItems(0);
          setTotalPages(1);
          setErr(e?.message || String(e));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [hydratedFromUrl, page, pageSize, timeframe, sortBy, sortDir, statusFilter, unlinkedOnly, laneFilter, readyOnly, handoffOnly, qaReviewOnly, debouncedQuery, refreshNonce]);

  useEffect(() => {
    if (!hydratedFromUrl) return;
    if (laneFilter === "QA_REVIEW" || qaReviewOnly) return;
    const submissionIds = items
      .filter((row) => row && row.id && row.qaFlags == null)
      .map((row) => String(row.id))
      .filter(Boolean);
    if (!submissionIds.length) return;

    let cancelled = false;

    async function hydrateQa() {
      try {
        const payload = await jsonFetch<{
          byId?: Record<
            string,
            {
              qaFlags?: SubmissionRow["qaFlags"];
              assessmentActor?: string | null;
            }
          >;
        }>("/api/submissions/qa-flags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionIds }),
          cache: "no-store",
        });
        if (cancelled) return;
        const byId = payload?.byId || {};
        setItems((prev) =>
          prev.map((row) => {
            const patch = row?.id ? byId[String(row.id)] : null;
            if (!patch) return row;
            return {
              ...row,
              qaFlags: (patch.qaFlags as SubmissionRow["qaFlags"]) ?? row.qaFlags ?? null,
              assessmentActor:
                typeof patch.assessmentActor === "string" || patch.assessmentActor === null
                  ? patch.assessmentActor
                  : (row.assessmentActor ?? null),
            };
          })
        );
      } catch {
        // Non-blocking optimization path; keep the list usable without QA badges.
      }
    }

    void hydrateQa();
    return () => {
      cancelled = true;
    };
  }, [hydratedFromUrl, items, laneFilter, qaReviewOnly]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (typeof window === "undefined" || !hydratedFromUrl) return;
    const params = new URLSearchParams(window.location.search);

    if (unlinkedOnly) params.set("unlinked", "1"); else params.delete("unlinked");
    if (readyOnly) params.set("ready", "1"); else params.delete("ready");
    if (handoffOnly) params.set("handoff", "1"); else params.delete("handoff");
    if (qaReviewOnly) params.set("qaOnly", "1"); else params.delete("qaOnly");

    if (query.trim()) params.set("q", query.trim()); else params.delete("q");
    if (statusFilter) params.set("status", statusFilter); else params.delete("status");

    if (laneFilter !== "ALL") params.set("lane", laneFilter); else params.delete("lane");
    if (timeframe !== "all") params.set("timeframe", timeframe); else params.delete("timeframe");
    if (sortBy !== "uploadedAt") params.set("sortBy", sortBy); else params.delete("sortBy");
    if (sortDir !== "desc") params.set("sortDir", sortDir); else params.delete("sortDir");
    if (page > 1) params.set("page", String(page)); else params.delete("page");
    if (pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(pageSize)); else params.delete("pageSize");

    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next !== current) window.history.replaceState({}, "", next);
  }, [
    hydratedFromUrl,
    unlinkedOnly,
    readyOnly,
    handoffOnly,
    qaReviewOnly,
    query,
    statusFilter,
    laneFilter,
    timeframe,
    sortBy,
    sortDir,
    page,
    pageSize,
  ]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const s of items) set.add(String(s.status));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    const sorted = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortBy === "student") {
        const av = String(a.student?.fullName || "").toLowerCase();
        const bv = String(b.student?.fullName || "").toLowerCase();
        return av.localeCompare(bv) * dir;
      }
      if (sortBy === "status") {
        const av = String(a.status || "").toUpperCase();
        const bv = String(b.status || "").toUpperCase();
        return av.localeCompare(bv) * dir;
      }
      if (sortBy === "grade") {
        return (rankGrade(String(a.grade || a.overallGrade || "")) - rankGrade(String(b.grade || b.overallGrade || ""))) * dir;
      }
      const at = new Date(a.uploadedAt).getTime() || 0;
      const bt = new Date(b.uploadedAt).getTime() || 0;
      return (at - bt) * dir;
    });

    return sorted;
  }, [items, sortBy, sortDir]);

  const dayGroups = useMemo(() => groupByDay(filtered), [filtered]);

  const laneGroups = useMemo<LaneGroup[]>(() => {
    const byLane = new Map<LaneKey, SubmissionRow[]>();
    for (const lane of LANE_ORDER) byLane.set(lane.key, []);

    for (const row of filtered) {
      const key = (row.automationState || "NEEDS_HUMAN") as LaneKey;
      byLane.get(key)?.push(row);
    }

    return LANE_ORDER.map((lane) => {
      const rows = byLane.get(lane.key) || [];
      return {
        ...lane,
        rows,
        dayGroups: groupByDay(rows),
      };
    });
  }, [filtered]);

  return {
    items,
    setItems,

    busy,
    err,
    msg,
    setErr,
    setMsg,

    refresh,

    // filters + setters
    unlinkedOnly,
    setUnlinkedOnly,
    timeframe,
    setTimeframe,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    laneFilter,
    setLaneFilter,
    sortBy,
    setSortBy,
    sortDir,
    setSortDir,
    handoffOnly,
    setHandoffOnly,
    qaReviewOnly,
    setQaReviewOnly,
    readyOnly,
    setReadyOnly,

    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    totalPages,

    statuses,
    filtered,
    dayGroups,
    laneGroups,
  };
}
