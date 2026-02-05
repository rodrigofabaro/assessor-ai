// lib/upload/search.ts
// Shared search helpers for upload pickers (students + assignments).
// Goals:
// - Prefix matching on any "word" in name (first name or surname)
// - Tolerant of apostrophes/curly quotes and punctuation (O’Brien vs O'Brien)
// - Also allow contains-match for emails/refs
// - Deterministic ordering (best matches first)

import type { Student, Assignment } from "./types";

function norm(raw: string): string {
  // Normalize diacritics + various apostrophes/quotes and punctuation.
  // Example: "O’Brien" -> "o brien"
  const s = String(raw || "")
    .normalize("NFKD")
    .replace(/[\u2018\u2019\u201B\u2032\u2035]/g, "'") // curly apostrophes/primes -> '
    .replace(/[\u201C\u201D\u2033\u2036]/g, '"') // curly quotes -> "
    .toLowerCase();

  // Keep letters/numbers/@/./-/_' as tokens; everything else becomes space.
  return s
    .replace(/[^a-z0-9@._'-]+/g, " ")
    .replace(/['"_\-]+/g, " ") // punctuation becomes separators for token matching
    .replace(/\s+/g, " ")
    .trim();
}

function scoreStudent(s: Student, q: string): number {
  if (!q) return 0;

  const qn = norm(q);
  if (!qn) return 0;

  const name = norm(s.fullName || "");
  const ref = norm(s.externalRef || "");
  const email = norm(s.email || "");

  // Exact match on full name
  if (name === qn) return 1000;

  const qWords = qn.split(" ");
  const nameWords = name ? name.split(" ") : [];

  // Strong: query matches a prefix of any name word (first name/surname)
  let prefixHits = 0;
  for (const qw of qWords) {
    if (!qw) continue;
    if (nameWords.some((nw) => nw.startsWith(qw))) prefixHits++;
  }
  if (prefixHits === qWords.length && qWords.length > 0) return 800 + prefixHits;

  // Medium: contains in name blob (handles "anna" inside "hannah")
  if (name.includes(qn)) return 650;

  // Medium: email/ref contains
  if (email.includes(qn)) return 600;
  if (ref.includes(qn)) return 580;

  // Weak: any query word appears anywhere in name
  let containsHits = 0;
  for (const qw of qWords) {
    if (!qw) continue;
    if (name.includes(qw)) containsHits++;
  }
  if (containsHits) return 400 + containsHits;

  return 0;
}

export function filterStudents(students: Student[], query: string, limit = 50): Student[] {
  const list = Array.isArray(students) ? students : [];
  const qn = norm(query);

  if (!qn) return list.slice(0, limit);

  const scored = list
    .map((s) => ({ s, score: scoreStudent(s, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // tie-breaker: alphabetical by name
      return String(a.s.fullName || "").localeCompare(String(b.s.fullName || ""), undefined, { sensitivity: "base" });
    })
    .slice(0, limit)
    .map((x) => x.s);

  return scored;
}

// "Enter to select" should only choose when it is unambiguous:
// - exactly 1 result OR
// - exact full name match OR
// - exact email/ref match
export function pickStudentOnEnter(filtered: Student[], query: string): Student | null {
  const list = Array.isArray(filtered) ? filtered : [];
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];

  const qn = norm(query);
  if (!qn) return null;

  for (const s of list) {
    if (norm(s.fullName || "") === qn) return s;
    if (norm(s.email || "") === qn) return s;
    if (norm(s.externalRef || "") === qn) return s;
  }
  return null;
}

/* ---------------- Assignments ---------------- */

function scoreAssignment(a: Assignment, q: string): number {
  const qn = norm(q);
  if (!qn) return 0;

  const unit = norm(a.unitCode || "");
  const ref = norm(a.assignmentRef || "");
  const title = norm(a.title || "");

  const blob = [unit, ref, title].filter(Boolean).join(" ");

  if (blob === qn) return 1000;
  if (unit === qn || ref === qn) return 900;
  if (blob.startsWith(qn)) return 850;
  if (blob.includes(qn)) return 700;

  // word prefix
  const qWords = qn.split(" ");
  const blobWords = blob.split(" ");
  let prefixHits = 0;
  for (const qw of qWords) {
    if (blobWords.some((bw) => bw.startsWith(qw))) prefixHits++;
  }
  if (prefixHits) return 500 + prefixHits;

  return 0;
}

export function filterAssignments(assignments: Assignment[], query: string, limit = 50): Assignment[] {
  const list = Array.isArray(assignments) ? assignments : [];
  const qn = norm(query);
  if (!qn) return list.slice(0, limit);

  return list
    .map((a) => ({ a, score: scoreAssignment(a, query) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => {
      if (y.score !== x.score) return y.score - x.score;
      return `${x.a.unitCode} ${x.a.assignmentRef || ""} ${x.a.title}`.localeCompare(
        `${y.a.unitCode} ${y.a.assignmentRef || ""} ${y.a.title}`,
        undefined,
        { sensitivity: "base" }
      );
    })
    .slice(0, limit)
    .map((x) => x.a);
}

export function pickByEnter<T extends { id: string }>(filtered: T[], query: string, exactBlobs: Array<(x: T) => string>): T | null {
  const list = Array.isArray(filtered) ? filtered : [];
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];

  const qn = norm(query);
  if (!qn) return null;

  for (const x of list) {
    for (const fn of exactBlobs) {
      if (norm(fn(x)) === qn) return x;
    }
  }
  return null;
}

export function pickAssignmentOnEnter(filtered: Assignment[], query: string): Assignment | null {
  return pickByEnter(filtered, query, [
    (a) => a.unitCode || "",
    (a) => a.assignmentRef || "",
    (a) => `${a.unitCode || ""} ${a.assignmentRef || ""} ${a.title || ""}`,
  ]);
}
