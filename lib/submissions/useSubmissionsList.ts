"use client";

import { useEffect, useMemo, useState } from "react";
import { isReadyToUpload } from "@/lib/submissionReady";
import { jsonFetch } from "./api";
import type { SubmissionRow } from "./types";
import { groupByDay } from "./logic";
import { deriveAutomationState } from "./automation";

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

export function useSubmissionsList() {
  const [items, setItems] = useState<SubmissionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");
  const [msg, setMsg] = useState<string>("");
  const [hydratedFromUrl, setHydratedFromUrl] = useState(false);

  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [readyOnly, setReadyOnly] = useState(false);
  const [laneFilter, setLaneFilter] = useState<LaneFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortBy>("uploadedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [handoffOnly, setHandoffOnly] = useState(false);
  const [qaReviewOnly, setQaReviewOnly] = useState(false);

  async function refresh() {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const list = await jsonFetch<SubmissionRow[]>("/api/submissions", { cache: "no-store" });
      setItems(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

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
    if (q !== null) setQuery(q);
    if (status !== null) setStatusFilter(status);

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

    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next !== current) window.history.replaceState({}, "", next);
  }, [hydratedFromUrl, unlinkedOnly, readyOnly, handoffOnly, qaReviewOnly, query, statusFilter, laneFilter, timeframe, sortBy, sortDir]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const s of items) set.add(String(s.status));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    const byLink = unlinkedOnly ? list.filter((s) => !s.studentId) : list;

    const q = (query || "").trim().toLowerCase();
    const byQuery = q
      ? byLink.filter((s) => {
          const hay = [s.filename, s.student?.fullName, s.student?.email, s.student?.externalRef, s.assignment?.title]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
      : byLink;

    const byStatus = statusFilter ? byQuery.filter((s) => String(s.status) === statusFilter) : byQuery;

    const byReady = readyOnly ? byStatus.filter((s) => isReadyToUpload(s)) : byStatus;

    const byLane =
      laneFilter === "ALL"
        ? byReady
        : laneFilter === "QA_REVIEW"
          ? byReady.filter((row) => Boolean(row.qaFlags?.shouldReview))
          : byReady.filter((row) => {
              const key = (row.automationState ||
                deriveAutomationState({
                  status: row.status,
                  studentId: row.studentId,
                  assignmentId: row.assignmentId,
                  extractedText: row.extractedText,
                  _count: row._count,
                  grade: row.grade,
                  overallGrade: row.overallGrade,
                  feedback: row.feedback,
                  markedPdfPath: row.markedPdfPath,
                  extractionQuality: row.extractionQuality,
                }).state) as LaneKey;
              return key === laneFilter;
            });

    const byHandoff = handoffOnly ? byLane.filter((s) => isReadyToUpload(s)) : byLane;
    const byQaReview = qaReviewOnly ? byHandoff.filter((s) => Boolean(s.qaFlags?.shouldReview)) : byHandoff;

    const sorted = [...byQaReview].sort((a, b) => {
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
        const rank = (v: string) => {
          const x = String(v || "").toUpperCase();
          if (x === "DISTINCTION") return 5;
          if (x === "MERIT") return 4;
          if (x === "PASS") return 3;
          if (x === "PASS_ON_RESUBMISSION") return 2;
          if (x === "REFER") return 1;
          return 0;
        };
        return (rank(String(a.grade || a.overallGrade || "")) - rank(String(b.grade || b.overallGrade || ""))) * dir;
      }
      const at = new Date(a.uploadedAt).getTime() || 0;
      const bt = new Date(b.uploadedAt).getTime() || 0;
      return (at - bt) * dir;
    });

    if (timeframe === "all") return sorted;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000;

    if (timeframe === "today") {
      return sorted.filter((s) => {
        const t = new Date(s.uploadedAt).getTime();
        return !Number.isNaN(t) && t >= startOfToday && t < endOfToday;
      });
    }

    // "This week" = week starting Monday.
    const day = now.getDay(); // 0=Sun
    const offsetToMonday = (day + 6) % 7;
    const startOfWeek = startOfToday - offsetToMonday * 24 * 60 * 60 * 1000;
    const endOfWeek = startOfWeek + 7 * 24 * 60 * 60 * 1000;

    return sorted.filter((s) => {
      const t = new Date(s.uploadedAt).getTime();
      return !Number.isNaN(t) && t >= startOfWeek && t < endOfWeek;
    });
  }, [items, unlinkedOnly, timeframe, query, statusFilter, readyOnly, laneFilter, sortBy, sortDir, handoffOnly, qaReviewOnly]);

  const dayGroups = useMemo(() => groupByDay(filtered), [filtered]);

  const laneGroups = useMemo<LaneGroup[]>(() => {
    const byLane = new Map<LaneKey, SubmissionRow[]>();
    for (const lane of LANE_ORDER) byLane.set(lane.key, []);

    for (const row of filtered) {
      const key = (row.automationState ||
        deriveAutomationState({
          status: row.status,
          studentId: row.studentId,
          assignmentId: row.assignmentId,
          extractedText: row.extractedText,
          _count: row._count,
          grade: row.grade,
          overallGrade: row.overallGrade,
          feedback: row.feedback,
          markedPdfPath: row.markedPdfPath,
          extractionQuality: row.extractionQuality,
        }).state) as LaneKey;
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

    statuses,
    filtered,
    dayGroups,
    laneGroups,
  };
}
