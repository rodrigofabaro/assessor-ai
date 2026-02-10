"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Pill } from "./ui";

type TaskConfidence = "CLEAN" | "HEURISTIC" | "OVERRIDDEN";

type TaskCardProps = {
  task: any;
  extractedTask?: any | null;
  overrideApplied?: boolean;
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
  if (!normalized) return "(empty)";
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const previewLines = lines.slice(0, 2).join(" ");
  const compact = previewLines.replace(/\s+/g, " ");
  return compact.length > 140 ? compact.slice(0, 140).trim() + "…" : compact;
}

function wordCount(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return 0;
  return normalized.split(/\s+/).filter(Boolean).length;
}

type TextBlock =
  | { type: "heading"; text: string }
  | { type: "p"; text: string }
  | { type: "ol"; items: string[]; style: "decimal" | "alpha" | "roman" }
  | { type: "ul"; items: string[] };

function parseBlocks(text: string): TextBlock[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const lines = normalized.split("\n");
  const blocks: TextBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listStyle: "decimal" | "alpha" | "roman" | "bullet" | null = null;

  const flushParagraph = () => {
    const content = paragraph.join("\n").trim();
    if (content) blocks.push({ type: "p", text: content });
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length) {
      if (listStyle === "bullet") {
        blocks.push({ type: "ul", items: [...listItems] });
      } else {
        blocks.push({ type: "ol", items: [...listItems], style: (listStyle || "decimal") as "decimal" | "alpha" | "roman" });
      }
    }
    listItems = [];
    listStyle = null;
  };

  const isHeadingLine = (line: string) => {
    if (!line) return false;
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^Task\s*\d+\b/i.test(trimmed)) return true;
    if (/^[A-Z0-9][A-Z0-9\s\-–—()]+$/.test(trimmed) && trimmed.length <= 80) return true;
    if (/^[A-Z][A-Za-z0-9\s\-–—()]+:$/.test(trimmed) && trimmed.length <= 80) return true;
    return false;
  };

  const listMatchers: Array<{ style: "decimal" | "alpha" | "roman"; regex: RegExp }> = [
    { style: "decimal", regex: /^(\d+)\.\s+(.*)$/ },
    { style: "alpha", regex: /^([a-z])\)\s+(.*)$/i },
    { style: "roman", regex: /^([ivxlcdm]+)\.\s+(.*)$/i },
  ];
  const bulletMatcher = /^[-•]\s+(.*)$/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      flushParagraph();
      continue;
    }

    if (isHeadingLine(line)) {
      flushList();
      flushParagraph();
      blocks.push({ type: "heading", text: line.replace(/:\s*$/, "") });
      continue;
    }

    const match = listMatchers.map((m) => ({ match: line.match(m.regex), style: m.style })).find((m) => m.match);
    if (match?.match) {
      flushParagraph();
      if (listStyle && listStyle !== match.style) flushList();
      listStyle = match.style;
      listItems.push(match.match[2]);
      continue;
    }

    const bulletMatch = line.match(bulletMatcher);
    if (bulletMatch) {
      flushParagraph();
      if (listStyle && listStyle !== "bullet") flushList();
      listStyle = "bullet";
      listItems.push(bulletMatch[1]);
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

function renderInlineText(text: string) {
  const urlRegex = /(https?:\/\/[^\s)]+)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text))) {
    const start = match.index;
    const url = match[0];
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));
    const cleaned = url.replace(/[),.;]+$/g, "");
    const trailing = url.slice(cleaned.length);
    nodes.push(
      <a
        key={`url-${start}`}
        href={cleaned}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-dotted decoration-sky-400 underline-offset-2 break-all text-sky-700 hover:text-sky-800"
      >
        {cleaned}
      </a>
    );
    if (trailing) nodes.push(trailing);
    lastIndex = start + url.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
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

export function TaskCard({ task, extractedTask, overrideApplied, defaultExpanded }: TaskCardProps) {
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const [showDiff, setShowDiff] = useState(false);
  const [showRepeated, setShowRepeated] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  const label = task?.label || (task?.n ? `Task ${task.n}` : "Task");
  const title = deriveTitle(task);
  const criteria = getCriteria(task);
  const preview = useMemo(() => buildPreview(task?.text || ""), [task?.text]);
  const blocks = useMemo(() => parseBlocks(task?.text || ""), [task?.text]);
  const totalWords = useMemo(() => wordCount(task?.text || ""), [task?.text]);
  const pages = Array.isArray(task?.pages) ? task.pages.filter(Boolean) : [];
  const aias = task?.aias ? String(task.aias) : "";

  const duplicateInfo = useMemo(() => {
    if (!blocks.length) return { duplicates: new Set<number>(), hiddenCount: 0 };
    const keyFor = (block: TextBlock) => {
      const raw =
        block.type === "ol" || block.type === "ul"
          ? block.items.join(" ")
          : block.text;
      const key = normalizeText(raw).toLowerCase();
      return key.length >= 80 ? key : "";
    };
    const counts = new Map<string, number>();
    blocks.forEach((block) => {
      const key = keyFor(block);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const duplicates = new Set<number>();
    blocks.forEach((block, idx) => {
      const key = keyFor(block);
      if (key && (counts.get(key) || 0) > 1) duplicates.add(idx);
    });
    return { duplicates, hiddenCount: duplicates.size };
  }, [blocks]);
  const hasDuplicates = duplicateInfo.duplicates.size > 0;

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
            <Pill
              cls={confidenceTone(confidence)}
              title={
                confidence === "HEURISTIC"
                  ? 'Low confidence means the extractor found the task, but the formatting/structure looks unreliable (e.g., duplicated markers like "a a a", broken line wraps, or missing headings). Review before locking.'
                  : confidence === "CLEAN"
                    ? "Clean means the task structure looks consistent (heading + body + lists detected reliably)."
                    : undefined
              }
            >
              {confidence === "OVERRIDDEN" ? "🔴 Overridden" : confidence === "HEURISTIC" ? "🟡 Low confidence" : "🟢 Clean"}
            </Pill>
            <Pill cls="bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200">{totalWords} words</Pill>
            {hasDuplicates ? (
              <Pill cls="bg-amber-50 text-amber-900 ring-1 ring-amber-200">Duplicate suspected</Pill>
            ) : null}
          </div>
          <div className="mt-2 text-sm font-semibold text-zinc-900">{title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            {pages.length ? <span>Pages: {pages.join(", ")}</span> : null}
            {aias ? <span>AIAS: {aias}</span> : null}
          </div>
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
              {showDiff ? "Hide differences" : "Show differences"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={async () => {
              const text = normalizeText(task?.text || "");
              if (!text) {
                setCopyStatus("failed");
                window.setTimeout(() => setCopyStatus("idle"), 2000);
                return;
              }
              try {
                await navigator.clipboard.writeText(text);
                setCopyStatus("copied");
              } catch {
                setCopyStatus("failed");
              }
              window.setTimeout(() => setCopyStatus("idle"), 2000);
            }}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy text"}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            {expanded ? "Collapse" : "View extracted text"}
          </button>
        </div>
      </div>

      {task?.warnings?.length ? (
        <div className="mt-3 text-xs text-amber-900">Warning: {task.warnings.join(", ")}</div>
      ) : null}

      {!expanded ? (
        <div className="mt-3 text-sm text-zinc-700 line-clamp-2">{preview}</div>
      ) : (
        <div className="mt-4 text-sm text-zinc-900">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
            {hasDuplicates ? (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-amber-900">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold">
                  Repeated blocks hidden
                </span>
                <button
                  type="button"
                  onClick={() => setShowRepeated((prev) => !prev)}
                  className="rounded-full border border-amber-200 bg-white px-2 py-0.5 font-semibold text-amber-900 hover:bg-amber-50"
                >
                  {showRepeated ? "Hide repeated blocks" : `Show repeated blocks (${duplicateInfo.hiddenCount})`}
                </button>
              </div>
            ) : null}
            {blocks.length ? (
              <div className="grid gap-3">
                {blocks.map((block, idx) => {
                  const isDuplicate = duplicateInfo.duplicates.has(idx);
                  if (isDuplicate && !showRepeated) return null;
                  if (block.type === "ol") {
                    return (
                      <ol
                        key={`ol-${idx}`}
                        className={
                          "space-y-1 " +
                          (block.style === "alpha"
                            ? "list-[lower-alpha] pl-7"
                            : block.style === "roman"
                              ? "list-[lower-roman] pl-9"
                              : "list-decimal pl-6") +
                          (isDuplicate ? " rounded-lg bg-amber-50 p-2" : "")
                        }
                      >
                        {block.items.map((item, itemIdx) => (
                          <li key={`item-${idx}-${itemIdx}`} className="leading-relaxed">
                            {renderInlineText(item)}
                          </li>
                        ))}
                      </ol>
                    );
                  }
                  if (block.type === "ul") {
                    return (
                      <ul
                        key={`ul-${idx}`}
                        className={"list-disc space-y-1 pl-5 " + (isDuplicate ? " rounded-lg bg-amber-50 p-2" : "")}
                      >
                        {block.items.map((item, itemIdx) => (
                          <li key={`item-${idx}-${itemIdx}`} className="leading-relaxed">
                            {renderInlineText(item)}
                          </li>
                        ))}
                      </ul>
                    );
                  }
                  if (block.type === "heading") {
                    return (
                      <div
                        key={`heading-${idx}`}
                        className={"text-sm font-semibold text-zinc-900 " + (isDuplicate ? "rounded-lg bg-amber-50 p-2" : "")}
                      >
                        {renderInlineText(block.text)}
                      </div>
                    );
                  }
                  return (
                    <p
                      key={`p-${idx}`}
                      className={"whitespace-pre-wrap leading-relaxed " + (isDuplicate ? "rounded-lg bg-amber-50 p-2" : "")}
                    >
                      {renderInlineText(block.text)}
                    </p>
                  );
                })}
              </div>
            ) : (
              <div className="text-zinc-500">(no body detected)</div>
            )}
          </div>
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
