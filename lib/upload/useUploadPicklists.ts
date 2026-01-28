"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Assignment, Student } from "./types";
import { loadPicklists } from "./picklists";

export type UseUploadPicklistsResult = {
  studentsSafe: Student[];
  assignmentsSafe: Assignment[];
  err: string;
  setErr: (v: string) => void;
  refresh: () => Promise<void>;
};

/**
 * Picklists for Upload page.
 *
 * Note: We intentionally defer the initial refresh with setTimeout(0) to satisfy
 * react-hooks/set-state-in-effect linting (avoids synchronous setState inside effect body).
 */
export function useUploadPicklists(): UseUploadPicklistsResult {
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [err, setErr] = useState<string>("");

  const refresh = useCallback(async () => {
    setErr("");
    const { students, assignments } = await loadPicklists();
    setStudents(students);
    setAssignments(assignments);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void refresh().catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    }, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const studentsSafe = useMemo(() => (Array.isArray(students) ? students : []), [students]);
  const assignmentsSafe = useMemo(() => (Array.isArray(assignments) ? assignments : []), [assignments]);

  return { studentsSafe, assignmentsSafe, err, setErr, refresh };
}
