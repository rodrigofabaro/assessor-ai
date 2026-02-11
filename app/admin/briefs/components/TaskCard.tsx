"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Pill } from "./ui";
import { detectTableBlocks } from "@/lib/extraction/render/tableBlocks";
import { extractIntroBeforeParts } from "@/lib/extraction/render/parseParts";

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

type TaskCardProps = {
  task: Task;
  extractedTask?: Task | null;
  overrideApplied?: boolean;
  defaultExpanded?: boolean;
  forcedExpanded?: boolean;
};

// --- Constants & Regex (Hoisted for Performance) ---

const URL_REGEX = /(https?:\/\/[^\s)]+)/g;

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

function startsWithListMarker(line: string) {
  const trimmed = line.trim();
  return /^([-•]|\d+[\.)]|[a-z][\.)]|[ivxlcdm]+[\.)])\s+/i.test(trimmed);
}

function reflowWrappedText(text: string) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
  const paragraphs: string[] = [];
  let chunk: string[] = [];

  const flushChunk = () => {
    if (!chunk.length) {
      paragraphs.push("");
      return;
    }

    let rebuilt = "";
    for (let i = 0; i < chunk.length; i += 1) {
      const current = chunk[i].trim();
      if (!current) continue;
      if (!rebuilt) {
        rebuilt = current;
        continue;
      }

      const prev = chunk[i - 1]?.trim() || "";
      const keepHardBreak = /[.!?:;]$/.test(prev) || startsWithListMarker(current);
      rebuilt += keepHardBreak ? `\n${current}` : ` ${current}`;
    }

    paragraphs.push(rebuilt.trim());
    chunk = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushChunk();
      continue;
    }
    chunk.push(line);
  }

  if (chunk.length) flushChunk();

  return paragraphs.join("\n\n").trim();
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

function wordCount(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return 0;
  return normalized.split(/\s+/).filter(Boolean).length;
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
  const [showWarningDetails, setShowWarningDetails] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  const expanded = typeof forcedExpanded === "boolean" ? forcedExpanded : expandedLocal;

  // -- Memoized Data Derivation --
  
  const label = task?.label || (task?.n ? `Task ${task.n}` : "Task");
  const criteria = getCriteria(task);
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

  const { introText, bodyText: bodyTextWithoutIntro } = useMemo(
    () => extractIntroBeforeParts(textWithoutContext),
    [textWithoutContext]
  );
  const introTextReflowed = useMemo(() => reflowWrappedText(introText), [introText]);
  const extractedScenarioText = typeof task?.scenarioText === "string" ? task.scenarioText.trim() : "";
  const scenarioText = extractedScenarioText || introTextReflowed;
  const taskQuestionsText = useMemo(
    () => reflowWrappedText(bodyTextWithoutIntro || textWithoutContext),
    [bodyTextWithoutIntro, textWithoutContext]
  );

  const tableBlocks = useMemo(() => detectTableBlocks(task), [task]);

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
          </div>
          
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
      {!expanded ? null : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
            
            {/* Context Lines */}
            {contextLines.length > 0 && (
              <div className="mb-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500">
                <div className="font-semibold text-zinc-600">Context line</div>
                <div className="mt-1">{contextLines[0]}</div>
              </div>
            )}

            {scenarioText && (
              <div className="mb-3 rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-700">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Vocational Scenario or Context</div>
                <div className="mt-2 whitespace-pre-wrap break-words leading-6">{renderInlineText(scenarioText)}</div>
              </div>
            )}

            <div className="mb-3 rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-700">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">{label}</div>
              <div className="mt-2 whitespace-pre-wrap break-words leading-6">{renderInlineText(taskQuestionsText)}</div>
            </div>

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

          </div>

          <TaskSidebar 
            totalWords={totalWords}
            pages={pages}
            confidence={confidence}
            warningsCount={warningItems.length}
            tablesCount={tableBlocks.length}
            partsCount={Array.isArray(task?.parts) ? task.parts.length : 0}
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
