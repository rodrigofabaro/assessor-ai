import type { Assignment, Student, PicklistsResponse } from "./types";
import { safeJson } from "./utils";

export async function loadPicklists(): Promise<{ students: Student[]; assignments: Assignment[] }> {
  const [sRes, aRes] = await Promise.all([fetch("/api/students"), fetch("/api/assignments")]);

  if (!sRes.ok) {
    const j = await safeJson(sRes);
    throw new Error((j as any)?.error || `Failed to load students (${sRes.status})`);
  }
  if (!aRes.ok) {
    const j = await safeJson(aRes);
    throw new Error((j as any)?.error || `Failed to load assignments (${aRes.status})`);
  }

  const sJson = (await safeJson(sRes)) as PicklistsResponse<Student>;
  const aJson = (await safeJson(aRes)) as PicklistsResponse<Assignment>;

  const s = (Array.isArray(sJson) ? sJson : (sJson as any)?.students) as Student[] | undefined;
  const a = (Array.isArray(aJson) ? aJson : (aJson as any)?.assignments) as Assignment[] | undefined;

  return {
    students: Array.isArray(s) ? s : [],
    assignments: Array.isArray(a) ? a : [],
  };
}
