export type QueueTerm = {
  key: string;
  label: string;
  meaning: string;
};

export const QUEUE_TERMS: QueueTerm[] = [
  {
    key: "AUTO_READY",
    label: "Auto-ready",
    meaning: "Linked and stable enough to run grading without manual intervention.",
  },
  {
    key: "NEEDS_HUMAN",
    label: "Needs Human",
    meaning: "Requires operator action such as linking or validation before grading.",
  },
  {
    key: "BLOCKED",
    label: "Blocked",
    meaning: "Hard issue present (for example OCR/extraction failure) and must be fixed first.",
  },
  {
    key: "COMPLETED",
    label: "Completed",
    meaning: "Grading finished and evidence outputs are available for review/export.",
  },
  {
    key: "QA_QUEUE",
    label: "QA queue",
    meaning: "Submissions flagged for mandatory QA preview before commit grading.",
  },
  {
    key: "HANDOFF",
    label: "Handoff mode",
    meaning: "Filter mode focused on records ready for external upload/handoff.",
  },
];
