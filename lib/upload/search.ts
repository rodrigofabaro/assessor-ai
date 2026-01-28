import type { Assignment, Student } from "./types";

function norm(s: string) {
  return (s || "").toLowerCase().trim();
}

export function filterStudents(students: Student[], query: string) {
  const q = norm(query);
  if (!q) return students;

  return students.filter((s) => {
    const blob = `${s.fullName ?? ""} ${s.externalRef ?? ""} ${s.email ?? ""}`.toLowerCase();
    return blob.includes(q);
  });
}

export function filterAssignments(assignments: Assignment[], query: string) {
  const q = norm(query);
  if (!q) return assignments;

  return assignments.filter((a) => {
    const blob = `${a.unitCode ?? ""} ${a.assignmentRef ?? ""} ${a.title ?? ""}`.toLowerCase();
    return blob.includes(q);
  });
}

export function pickByEnter<T extends { id: string }>(
  items: T[],
  query: string,
  getExactKeys: (item: T) => string[]
): T | null {
  const q = norm(query);
  if (!q) return items.length === 1 ? items[0] : null;

  const exact = items.find((it) => getExactKeys(it).some((k) => norm(k) === q));
  if (exact) return exact;

  return items.length === 1 ? items[0] : null;
}
