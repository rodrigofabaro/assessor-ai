"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Pill } from "./ui";
import { detectTableBlocks } from "@/lib/extraction/render/tableBlocks";
import { parseParts } from "@/lib/extraction/render/parseParts";

// --- Types ---

type TaskConfidence = "CLEAN" | "HEURISTIC" | "OVERRIDDEN";

interface Task {
  n?: number | string;
  label?: string;
  title?: string;
  heading?: string;
  text?: string;
  pages?: (string | number)[];
  aias?: string | number;
  confidence?: TaskConfidence;
  warnings?: string[];
  parts?: any; // Specific type depends on external lib
  criteriaCodes?: string[];
  criteriaRefs?: string[];
  criteria?: string[];
  [key: string]: any;
}

type TextBlock =
  | { type: "heading"; text: string }
  | { type: "p"; text: string }
  | { type: "ol"; items: string[]; style: "decimal" | "alpha" | "roman" }
  | { type: "ul"; items: string[] };

type TaskCardProps = {
  task: Task;
  extractedTask?: Task | null;
  overrideApplied?: boolean;
  defaultExpanded?: boolean;
  forcedExpanded?: boolean;
};

// --- Constants & Regex (Hoisted for Performance) ---

const URL_REGEX = /(https?:\/\/[^\s)]+)/g;
const HEADING_REGEX_TASK = /^Task\s*\d+\b/i;
const HEADING_REGEX_CAPS = /^[A-Z0-9][A-Z0-9\s\-–—()]+$/;
const HEADING_REGEX_COLON = /^[A-Z][A-Za-z0-9\s\-–—()]+:$/;
const LIST_MATCHERS = [
  { style: "decimal", regex: /^(\d+)\.\s+(.*)$/ },
  { style: "alpha", regex: /^([a-z])[\.)]\s+(.*)$/i },
  { style: "roman", regex: /^([ivxlcdm]+)[\.)]\s+(.*)$/i },
] as const;
const BULLET_REGEX = /^[-•]\s+(.*)$/;

// --- Helper Functions ---

function confidenceTone(confidence: TaskConfidence) {
  switch (confidence) {
    case "OVERRIDDEN":
      return "bg-rose-50 text-rose-800 ring-1 ring-rose-200";
    case "HEURISTIC":
      return "bg-amber-50 text-amber-900 ring-1 ring-amber-200";
    default:
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
  }
}

function normalizeText(text: string) {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\r/g, "\n")
    .trim();
}

function cleanEncodingNoise(text: string) {
  return (text || "").replace(/[\uFFFD\u0000-\u001F]/g, (match) =>
    match === "\n" ? "\n" : " "
  );
}

function deriveTitle(task: Task) {
  if (task?.title) return String(task.title).trim();
  if (task?.heading) return String(task.heading).trim();
  
  const text = normalizeText(task?.text || "");
  if (!text) return "Untitled";

  const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean) || "";
  
  const cleaned = firstLine
    .replace(/^Task\s*\d+\s*[:\-–—]?\s*/i, "") // Remove "Task 1: "
    .replace(/^\d+\.\s*/, "") // Remove "1. "
    .trim();

  return cleaned || "Untitled";
}

function getCriteria(task: Task): string[] {
  const candidates = [task?.criteriaCodes, task?.criteriaRefs, task?.criteria];
  for (const c of candidates) {
    if (Array.isArray(c)) {
      return c.map((v) => String(v).toUpperCase()).filter(Boolean);
    }
  }
  return [];
}

function buildPreview(text: string) {
  const normalized = normalizeText(cleanEncodingNoise(text));
  if (!normalized) return "(empty)";
  
  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  const compact = lines.slice(0, 2).join(" ").replace(/\s+/g, " ");
  
  return compact.length > 180 ? compact.slice(0, 180).trim() + "…" : compact;
}

function wordCount(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return 0;
  return normalized.split(/\s+/).filter(Boolean).length;
}

function parseBlocks(text: string): TextBlock[] {
  const normalized = normalizeText(cleanEncodingNoise(text));
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
        blocks.push({
          type: "ol",
          items: [...listItems],
          style: (listStyle || "decimal") as "decimal" | "alpha" | "roman",
        });
      }
    }
    listItems = [];
    listStyle = null;
  };

  const isHeadingLine = (line: string) => {
    if (!line) return false;
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (HEADING_REGEX_TASK.test(trimmed)) return true;
    if (HEADING_REGEX_CAPS.test(trimmed) && trimmed.length <= 80) return true;
    if (HEADING_REGEX_COLON.test(trimmed) && trimmed.length <= 80) return true;
    return false;
  };

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

    // Check Ordered Lists
    const orderedMatch = LIST_MATCHERS
      .map((m) => ({ match: line.match(m.regex), style: m.style }))
      .find((m) => m.match);

    if (orderedMatch?.match) {
      flushParagraph();
      if (listStyle && listStyle !== orderedMatch.style) flushList();
      listStyle = orderedMatch.style;
      listItems.push(orderedMatch.match[2]);
      continue;
    }

    // Check Unordered Lists
    const bulletMatch = line.match(BULLET_REGEX);
    if (bulletMatch) {
      flushParagraph();
      if (listStyle && listStyle !== "bullet") flushList();
      listStyle = "bullet";
      listItems.push(bulletMatch[1]);
      continue;
    }

    // Continuation of list item
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


  // Reset lastIndex because we are reusing the global regex (if it were global) 
  // or creating a new instance. Since we moved it out, we must be careful.
  // Ideally, re-create regex or use split. 
  // For safety with global flags in loops:
function renderInlineText(text: string) {
  const input = String(text ?? "");
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  const regex = new RegExp(URL_REGEX.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input))) {
    const start = match.index;
    const url = match[0];

    if (start > lastIndex) nodes.push(input.slice(lastIndex, start));

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

  if (lastIndex < input.length) nodes.push(input.slice(lastIndex));
  return nodes;
}


// --- Sub-Components ---

function DiffView({
  label,
  lines,
  diffIndices,
}: {
  label: string;
  lines: string[];
  diffIndices: Set<number>;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="text-xs font-semibold text-zinc-600">{label}</div>
      <div className="mt-2 space-y-1 text-sm text-zinc-900">
        {lines.length ? (
          lines.map((line, idx) => (
            <div
              key={`${label}-${idx}`}
              className={
                "whitespace-pre-wrap rounded-md px-2 py-1 " +
                (diffIndices.has(idx) ? "bg-amber-50" : "")
              }
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

function TaskSidebar({ 
  totalWords, 
  pages, 
  confidence, 
  warningsCount, 
  tablesCount, 
  partsCount 
}: { 
  totalWords: number; 
  pages: (string|number)[]; 
  confidence: string; 
  warningsCount: number; 
  tablesCount: number; 
  partsCount: number 
}) {
  return (
    <aside className="rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-700 h-fit">
      <div className="font-semibold text-zinc-900">Task metadata</div>
      <div className="mt-2 space-y-1">
        <div>Words: {totalWords}</div>
        <div>Pages: {pages.length ? pages.join(", ") : "—"}</div>
        <div>Status: {confidence}</div>
        <div>Warnings: {warningsCount}</div>
        <div>Tables: {tablesCount}</div>
        <div>Parts: {partsCount}</div>
      </div>
      <div className="mt-3 border-t border-zinc-200 pt-2 text-zinc-500">
        Use “Copy text” for plain-text export.
      </div>
    </aside>
  );
}

function TaskBody({
  blocks,
  duplicateInfo,
  showRepeated,
}: {
  blocks: TextBlock[];
  duplicateInfo: { duplicates: Set<number> };
  showRepeated: boolean;
}) {
  if (!blocks.length) {
    return <div className="text-zinc-500">(no body detected)</div>;
  }

  return (
    <div className="grid gap-3">
      {blocks.map((block, idx) => {
        const isDuplicate = duplicateInfo.duplicates.has(idx);
        if (isDuplicate && !showRepeated) return null;

        const commonClass = isDuplicate ? "rounded-lg bg-amber-50 p-2" : "";

        if (block.type === "heading") {
          return (
            <div key={`h-${idx}`} className={`text-sm font-semibold text-zinc-900 ${commonClass}`}>
              {renderInlineText(block.text)}
            </div>
          );
        }
        
        if (block.type === "p") {
          return (
            <p key={`p-${idx}`} className={`whitespace-pre-wrap leading-relaxed ${commonClass}`}>
              {renderInlineText(block.text)}
            </p>
          );
        }

        if (block.type === "ul") {
          return (
            <ul key={`ul-${idx}`} className={`list-disc space-y-1 pl-5 ${commonClass}`}>
              {block.items.map((item, i) => (
                <li key={i} className="leading-relaxed">{renderInlineText(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "ol") {
          const styleClass =
            block.style === "alpha" ? "list-[lower-alpha] pl-7" :
            block.style === "roman" ? "list-[lower-roman] pl-9" : 
            "list-decimal pl-6";
          
          return (
            <ol key={`ol-${idx}`} className={`space-y-1 ${styleClass} ${commonClass}`}>
              {block.items.map((item, i) => (
                <li key={i} className="leading-relaxed">{renderInlineText(item)}</li>
              ))}
            </ol>
          );
        }

        return null;
      })}
    </div>
  );
}

// --- Main Component ---

export function TaskCard({
  task,
  extractedTask,
  overrideApplied,
  defaultExpanded,
  forcedExpanded,
}: TaskCardProps) {
  const [expandedLocal, setExpandedLocal] = useState(!!defaultExpanded);
  const [showDiff, setShowDiff] = useState(false);
  const [showRepeated, setShowRepeated] = useState(false);
  const [showWarningDetails, setShowWarningDetails] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  const expanded = typeof forcedExpanded === "boolean" ? forcedExpanded : expandedLocal;

  // -- Memoized Data Derivation --
  
  const label = task?.label || (task?.n ? `Task ${task.n}` : "Task");
  const title = deriveTitle(task);
  const criteria = getCriteria(task);
  const hasExplicitParts = Array.isArray(task?.parts) && task.parts.length > 0;
  const taskKeyPrefix = `task-${String(task?.n ?? "unknown")}`;
  const preview = useMemo(() => buildPreview(task?.text || ""), [task?.text]);
  const totalWords = useMemo(() => wordCount(task?.text || ""), [task?.text]);
  const pages = Array.isArray(task?.pages) ? task.pages.filter(Boolean) : [];
  
  const confidence: TaskConfidence = overrideApplied
    ? "OVERRIDDEN"
    : task?.confidence === "HEURISTIC" ? "HEURISTIC" : "CLEAN";

  const warningItems: string[] = Array.isArray(task?.warnings)
    ? task.warnings.map((w: unknown) => String(w))
    : [];

  // Logic: Isolate context lines (metadata often found at start of task)
  const { contextLines, textWithoutContext } = useMemo(() => {
    const text = normalizeText(task?.text || "");
    const lines = text.split("\n").map((line) => line.trim());
    const context = new Set<string>();
    
    // This regex is specific to your domain logic
    lines.forEach((line) => {
      if (/^Further to your discussion\b/i.test(line)) context.add(line);
    });

    const filteredText = text
      .split("\n")
      .filter((line) => !context.has(line.trim()))
      .join("\n");

    return { contextLines: Array.from(context), textWithoutContext: filteredText };
  }, [task?.text]);

  // Heavy Parsing
  const blocks = useMemo(
    () => (hasExplicitParts ? [] : parseBlocks(textWithoutContext)),
    [hasExplicitParts, textWithoutContext]
  );
  const parsedParts = useMemo(
    () => (hasExplicitParts ? parseParts(task?.text || "", task?.parts) : []),
    [hasExplicitParts, task?.parts, task?.text]
  );
  const tableBlocks = useMemo(() => detectTableBlocks(task), [task]);

  // Duplicate Detection
  const duplicateInfo = useMemo(() => {
    if (!blocks.length) return { duplicates: new Set<number>(), hiddenCount: 0 };
    
    const keyFor = (block: TextBlock) => {
      const raw = block.type === "ol" || block.type === "ul" ? block.items.join(" ") : block.text;
      const key = normalizeText(raw).toLowerCase();
      // Only treat long blocks as duplicates to avoid false positives on short generic phrases
      return key.length >= 80 ? key : "";
    };

    const counts = new Map<string, number>();
    blocks.forEach((block) => {
      const key = keyFor(block);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });

    const duplicates = new Set<number>();
    blocks.forEach((block, idx) => {
      const key = keyFor(block);
      if (key && (counts.get(key) || 0) > 1) duplicates.add(idx);
    });

    return { duplicates, hiddenCount: duplicates.size };
  }, [blocks]);

  // Diff Logic
  const diffData = useMemo(() => {
    if (!overrideApplied) return null;
    const extractedText = normalizeText(extractedTask?.text || "");
    const currentText = normalizeText(task?.text || "");
    const leftLines = extractedText ? extractedText.split("\n") : [];
    const rightLines = currentText ? currentText.split("\n") : [];
    const max = Math.max(leftLines.length, rightLines.length);
    const diffIndices = new Set<number>();
    
    for (let i = 0; i < max; i++) {
      if ((leftLines[i] || "") !== (rightLines[i] || "")) diffIndices.add(i);
    }
    return { leftLines, rightLines, diffIndices };
  }, [extractedTask?.text, overrideApplied, task?.text]);

  const handleCopy = async () => {
    const text = normalizeText(task?.text || "");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    setTimeout(() => setCopyStatus("idle"), 2000);
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-all">
      {/* --- Header Section --- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pill cls="bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200">{label}</Pill>
            <Pill cls={confidenceTone(confidence)}>
              {confidence === "OVERRIDDEN" ? "Overridden" : confidence === "HEURISTIC" ? "Warnings" : "Clean"}
            </Pill>
            <Pill cls="bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200">{totalWords} words</Pill>
            {warningItems.length > 0 && (
              <Pill cls="bg-amber-50 text-amber-900 ring-1 ring-amber-200">Warnings</Pill>
            )}
            {duplicateInfo.duplicates.size > 0 && (
              <Pill cls="bg-amber-50 text-amber-900 ring-1 ring-amber-200">Duplicate suspected</Pill>
            )}
          </div>
          
          <div className="mt-2 text-sm font-semibold text-zinc-900">{title}</div>
          
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            {pages.length > 0 && <span>Pages: {pages.join(", ")}</span>}
            {task?.aias && <span>AIAS: {task.aias}</span>}
          </div>

          {criteria.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {criteria.map((code) => (
                <Pill key={code} cls="bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200">
                  {code}
                </Pill>
              ))}
            </div>
          )}
        </div>

        {/* --- Actions --- */}
        <div className="flex items-center gap-2 shrink-0">
          {overrideApplied && (
            <button
              type="button"
              onClick={() => setShowDiff((prev) => !prev)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              {showDiff ? "Hide diff" : "Show diff"}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
              copyStatus === "copied" 
                ? "border-emerald-200 bg-emerald-50 text-emerald-700" 
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {copyStatus === "copied" ? "Copied!" : copyStatus === "failed" ? "Failed" : "Copy text"}
          </button>
          <button
            type="button"
            onClick={() => setExpandedLocal((prev) => !prev)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {/* --- Warning Toggle --- */}
      {warningItems.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowWarningDetails((prev) => !prev)}
            className="text-xs font-semibold text-amber-900 underline underline-offset-2"
          >
            {showWarningDetails ? "Hide warnings" : `Show warnings (${warningItems.length})`}
          </button>
          {showWarningDetails && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">
              {warningItems.map((w, i) => (
                <li key={`${w}-${i}`}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* --- Content Area --- */}
      {!expanded ? (
        <div className="mt-3 text-sm text-zinc-700 line-clamp-2">{preview}</div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
            
            {/* Context Lines */}
            {contextLines.length > 0 && (
              <div className="mb-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500">
                <div className="font-semibold text-zinc-600">Context line</div>
                <div className="mt-1">{contextLines[0]}</div>
              </div>
            )}

            {/* Render Parsed Parts */}
            {hasExplicitParts && parsedParts.length > 0 && (
              <div className="mb-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Question parts
                </div>
                <ol className="list-[lower-alpha] space-y-2 pl-6">
                  {parsedParts.map((part: any, partIdx: number) => (
                    <li key={`${taskKeyPrefix}-part-${partIdx}-${String(part.key ?? "")}`}>
                      <div className="whitespace-pre-wrap">{renderInlineText(part.text)}</div>
                      {part.children?.length ? (
                        <ol className="mt-1 list-[lower-roman] space-y-1 pl-6">
                          {part.children.map((child: any, childIdx: number) => (
                            <li key={`${taskKeyPrefix}-part-${partIdx}-child-${childIdx}-${String(child.key ?? "")}`}>
                              <span className="whitespace-pre-wrap">{renderInlineText(child.text)}</span>
                            </li>
                          ))}
                        </ol>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Render Tables */}
            {tableBlocks.length > 0 && (
              <div className="mb-4 space-y-3">
                {tableBlocks.map((tableBlock: any, tableIndex: number) =>
                  tableBlock.type === "table" ? (
                    <div key={`table-${tableIndex}`} className="overflow-x-auto rounded-lg border border-zinc-300 bg-white">
                      <table className="min-w-full text-left text-xs text-zinc-800">
                        <thead className="bg-zinc-100">
                          <tr>
                            {tableBlock.headers.map((header: string, idx: number) => (
                              <th key={`h-${tableIndex}-${idx}`} className="whitespace-nowrap px-3 py-2 font-semibold">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tableBlock.rows.map((row: string[], rowIdx: number) => (
                            <tr key={`r-${tableIndex}-${rowIdx}`} className="border-t border-zinc-200">
                              {row.map((cell, cellIdx) => (
                                <td key={`c-${tableIndex}-${rowIdx}-${cellIdx}`} className="whitespace-nowrap px-3 py-2 align-top">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div key={`table-fallback-${tableIndex}`} className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                      <div className="mb-1 text-xs font-semibold text-amber-900">{tableBlock.warning}</div>
                      <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-amber-900">{tableBlock.text}</pre>
                    </div>
                  )
                )}
              </div>
            )}

            {/* Hidden Blocks Toggle */}
            {!hasExplicitParts && duplicateInfo.hiddenCount > 0 && (
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
            )}

            {/* Main Text Body */}
            {!hasExplicitParts && (
              <TaskBody 
                blocks={blocks} 
                duplicateInfo={duplicateInfo} 
                showRepeated={showRepeated} 
              />
            )}
          </div>

          <TaskSidebar 
            totalWords={totalWords}
            pages={pages}
            confidence={confidence}
            warningsCount={warningItems.length}
            tablesCount={tableBlocks.length}
            partsCount={parsedParts.length}
          />
        </div>
      )}

      {/* --- Diff View --- */}
      {showDiff && diffData && (
        <div className="mt-4 grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2">
          <DiffView label="Extracted" lines={diffData.leftLines} diffIndices={diffData.diffIndices} />
          <DiffView label="Current" lines={diffData.rightLines} diffIndices={diffData.diffIndices} />
        </div>
      )}
    </div>
  );
}
