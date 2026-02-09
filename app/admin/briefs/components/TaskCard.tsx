"use client";

import { useMemo, useState } from "react";
import { Pill } from "./ui";

type TaskConfidence = "CLEAN" | "HEURISTIC" | "OVERRIDDEN";

type TaskCardProps = {
  task: any;
  extractedTask?: any | null;
  overrideApplied?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  defaultExpanded?: boolean;
};

function confidenceTone(confidence: TaskConfidence) {
  if (confidence === "OVERRIDDEN") return "bg-rose-50 text-rose-800 ring-1 ring-rose-200";
  if (confidence === "HEURISTIC") return "bg-amber-50 text-amber-900 ring-1 ring-amber-200";
  return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
}

function normalizeText(text: string) {
  return (text || "").replace(/\r\n/g, "\n").replace(/\t/g, " ").trim();
}

function stripAiasLines(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  const lines = normalized
    .split("\n")
    .filter((line) => !/^\(?\s*AIAS\s*\d+\s*\)?$/i.test(line.trim()));
  return lines.join("\n").trim();
}

function deriveTitle(task: any) {
  if (task?.title) return String(task.title).trim();
  if (task?.heading) return String(task.heading).trim();
  const text = normalizeText(task?.text || "");
  if (!text) return "Untitled";
  const firstLine = text.split("\n").map((line) => line.trim()).find(Boolean) || "";
  const cleaned = firstLine
    .replace(/^Task\s*\d+\s*[:\-–—]?\s*/i, "")
    .replace(/^\d+\.\s*/, "")
    .trim();
  return cleaned || "Untitled";
}

function getCriteria(task: any): string[] {
  const candidates = [task?.criteriaCodes, task?.criteriaRefs, task?.criteria];
  for (const c of candidates) {
    if (Array.isArray(c)) return c.map((v) => String(v).toUpperCase()).filter(Boolean);
  }
  return [];
}

function buildPreview(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return { text: "(empty)", hasMore: false };
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const previewLines = lines.slice(0, 4);
  let compact = previewLines.join("\n").replace(/\s+$/g, "");
  const hasMore = lines.length > previewLines.length;
  if (compact.length > 420) compact = compact.slice(0, 420).trim();
  return { text: compact + (hasMore ? "…" : ""), hasMore };
}

type TextBlock = { type: "p"; text: string } | { type: "ol"; items: string[] };

function parseBlocks(text: string): TextBlock[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const lines = normalized.split("\n");
  const blocks: TextBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    const content = paragraph.join("\n").trim();
    if (content) blocks.push({ type: "p", text: content });
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length) blocks.push({ type: "ol", items: [...listItems] });
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      flushParagraph();
      continue;
    }

    const listMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[2]);
      continue;
    }

    if (listItems.length) {
      listItems[listItems.length - 1] += ` ${line}`;
      continue;
    }

    paragraph.push(line);
  }

  flushList();
  flushParagraph();
  return blocks;
}

function DiffBlock({ label, lines, diffIndices }: { label: string; lines: string[]; diffIndices: Set<number> }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="text-xs font-semibold text-zinc-600">{label}</div>
      <div className="mt-2 space-y-1 text-sm text-zinc-900">
        {lines.length ? (
          lines.map((line, idx) => (
            <div
              key={`${label}-${idx}`}
              className={"whitespace-pre-wrap rounded-md px-2 py-1 " + (diffIndices.has(idx) ? "bg-amber-50" : "")}
            >
              {line || " "}
            </div>
          ))
        ) : (
          <div className="text-zinc-500">(empty)</div>
        )}
      </div>
    </div>
  );
}

export function TaskCard({ task, extractedTask, overrideApplied, expanded, onToggle, defaultExpanded }: TaskCardProps) {
  const [localExpanded, setLocalExpanded] = useState(!!defaultExpanded);
  const [showDiff, setShowDiff] = useState(false);
  const isControlled = typeof expanded === "boolean";
  const isExpanded = isControlled ? expanded : localExpanded;

  const label = task?.label || (task?.n ? `Task ${task.n}` : "Task");
  const title = deriveTitle(task);
  const criteria = getCriteria(task);
  const displayText = useMemo(() => stripAiasLines(task?.text || ""), [task?.text]);
  const preview = useMemo(() => buildPreview(displayText), [displayText]);
  const blocks = useMemo(() => parseBlocks(displayText), [displayText]);

  const confidence: TaskConfidence = overrideApplied
    ? "OVERRIDDEN"
    : task?.confidence === "HEURISTIC"
      ? "HEURISTIC"
      : "CLEAN";

  const diffData = useMemo(() => {
    const extractedText = normalizeText(extractedTask?.text || "");
    const currentText = normalizeText(task?.text || "");
    if (!overrideApplied) return null;
    const leftLines = extractedText ? extractedText.split("\n") : [];
    const rightLines = currentText ? currentText.split("\n") : [];
    const max = Math.max(leftLines.length, rightLines.length);
    const diffIndices = new Set<number>();
    for (let i = 0; i < max; i += 1) {
      if ((leftLines[i] || "") !== (rightLines[i] || "")) diffIndices.add(i);
    }
    return { leftLines, rightLines, diffIndices };
  }, [extractedTask?.text, overrideApplied, task?.text]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill cls="bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200">{label}</Pill>
            <Pill cls={confidenceTone(confidence)}>
              {confidence === "OVERRIDDEN" ? "🔴 Overridden" : confidence === "HEURISTIC" ? "🟡 Heuristic" : "🟢 Clean"}
            </Pill>
            {task?.aias ? (
              <Pill cls="bg-sky-50 text-sky-900 ring-1 ring-sky-200">{String(task.aias).toUpperCase()}</Pill>
            ) : null}
          </div>
          <div className="mt-2 text-sm font-semibold text-zinc-900">{title}</div>
          {criteria.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {criteria.map((code) => (
                <Pill key={code} cls="bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200">
                  {code}
                </Pill>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {overrideApplied ? (
            <button
              type="button"
              onClick={() => setShowDiff((prev) => !prev)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              {showDiff ? "Hide changes" : "View changes"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              onToggle?.();
              if (!isControlled) setLocalExpanded((prev) => !prev);
            }}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {task?.warnings?.length ? (
        <div className="mt-3 text-xs text-amber-900">Warning: {task.warnings.join(", ")}</div>
      ) : null}

      {!isExpanded ? (
        <div className="mt-3 max-w-3xl whitespace-pre-wrap text-sm text-zinc-700">{preview.text}</div>
      ) : (
        <div className="mt-4 max-w-3xl text-sm text-zinc-900">
          {blocks.length ? (
            <div className="grid gap-3">
              {blocks.map((block, idx) =>
                block.type === "ol" ? (
                  <ol key={`ol-${idx}`} className="list-decimal space-y-1 pl-5">
                    {block.items.map((item, itemIdx) => (
                      <li key={`item-${idx}-${itemIdx}`} className="leading-relaxed">
                        {item}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p key={`p-${idx}`} className="whitespace-pre-wrap leading-relaxed">
                    {block.text}
                  </p>
                )
              )}
            </div>
          ) : (
            <div className="text-zinc-500">(no body detected)</div>
          )}
        </div>
      )}

      {showDiff && diffData ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2">
          <DiffBlock label="Extracted" lines={diffData.leftLines} diffIndices={diffData.diffIndices} />
          <DiffBlock label="Current" lines={diffData.rightLines} diffIndices={diffData.diffIndices} />
        </div>
      ) : null}
    </div>
  );
}
