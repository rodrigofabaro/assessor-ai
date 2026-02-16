"use client";

import { useEffect, useMemo, useState } from "react";
import { isReadyToUpload } from "@/lib/submissionReady";
import { jsonFetch } from "./api";
import type { SubmissionRow } from "./types";
import { groupByDay } from "./logic";
import { deriveAutomationState } from "./automation";

export type Timeframe = "today" | "week" | "all";
export type LaneKey = "AUTO_READY" | "NEEDS_HUMAN" | "BLOCKED" | "COMPLETED";

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

  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [readyOnly, setReadyOnly] = useState(false);

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

    if (timeframe === "all") return byReady;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000;

    if (timeframe === "today") {
      return byReady.filter((s) => {
        const t = new Date(s.uploadedAt).getTime();
        return !Number.isNaN(t) && t >= startOfToday && t < endOfToday;
      });
    }

    // "This week" = week starting Monday.
    const day = now.getDay(); // 0=Sun
    const offsetToMonday = (day + 6) % 7;
    const startOfWeek = startOfToday - offsetToMonday * 24 * 60 * 60 * 1000;
    const endOfWeek = startOfWeek + 7 * 24 * 60 * 60 * 1000;

    return byReady.filter((s) => {
      const t = new Date(s.uploadedAt).getTime();
      return !Number.isNaN(t) && t >= startOfWeek && t < endOfWeek;
    });
  }, [items, unlinkedOnly, timeframe, query, statusFilter, readyOnly]);

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
    readyOnly,
    setReadyOnly,

    statuses,
    filtered,
    dayGroups,
    laneGroups,
  };
}
