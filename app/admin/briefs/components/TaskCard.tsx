"use client";

import { useMemo, useState } from "react";
import { Pill } from "./ui";
import { detectTableBlocks, type StructuredTableBlock } from "@/lib/extraction/render/tableBlocks";
import { extractIntroBeforeParts } from "@/lib/extraction/render/parseParts";
import InlineEquationText from "./InlineEquationText";

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
  aiCorrected?: boolean;
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
  equationsById?: Record<string, any>;
  openPdfHref?: string;
  canEditLatex?: boolean;
  onSaveEquationLatex?: (equationId: string, latex: string) => Promise<void> | void;
};



type RenderSegment =
  | { type: "text"; text: string }
  | { type: "table"; block: StructuredTableBlock };

type ScenarioBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; listType: "ul" | "ol"; items: string[] };

type StructuredPart = {
  key: string;
  text: string;
  children: Array<{ key: string; text: string }>;
};

function stripInlineSamplePowerTable(text: string) {
  return String(text || "")
    .replace(
      /(?:^|\n)\s*Sample\s+(?:\d+\s+){5,}\d+\s*\n\s*Power\s*\(\+?dBm\)\s+(?:\d+(?:\.\d+)?\s+){5,}\d+(?:\.\d+)?\s*(?=\n|$)/gi,
      "\n"
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
// --- Constants & Regex (Hoisted for Performance) ---

const SCENARIO_BULLET_REGEX = /^\s*(o|•|-|\*)\s+(.+)$/;
const SCENARIO_NUMBERED_REGEX = /^\s*(\d+)\.\s+(.+)$/;

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

function normalizeComparable(text: string) {
  return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
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

function renderInlineText(
  text: string,
  options?: {
    equationsById?: Record<string, any>;
    openPdfHref?: string;
    canEditLatex?: boolean;
    onSaveEquationLatex?: (equationId: string, latex: string) => Promise<void> | void;
  }
) {
  return (
    <InlineEquationText
      text={String(text ?? "")}
      equationsById={options?.equationsById}
      openPdfHref={options?.openPdfHref}
      canEditLatex={options?.canEditLatex}
      onSaveLatex={options?.onSaveEquationLatex}
    />
  );
}

function formatPdfTextToBlocks(text: string, options?: { reflowWrappedLines?: boolean }): ScenarioBlock[] {
  const normalized = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Bullet glyphs are sometimes extracted inline after a colon; promote them to their own lines.
    .replace(/\s+•\s+/g, "\n• ");
  const lines = normalized.split("\n");
  const blocks: ScenarioBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    const text = paragraphLines
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .join(options?.reflowWrappedLines ? " " : "\n")
      .replace(/\s{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listItems.length || !listType) return;
    const items = listItems.map((item) => item.trim()).filter(Boolean);
    if (items.length) blocks.push({ type: "list", listType, items });
    listItems = [];
    listType = null;
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const numberedMatch = line.match(SCENARIO_NUMBERED_REGEX);
    if (numberedMatch) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(numberedMatch[2].trim());
      continue;
    }

    const bulletMatch = line.match(SCENARIO_BULLET_REGEX);
    if (bulletMatch) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(bulletMatch[2].trim());
      continue;
    }

    const isNewListMarker = SCENARIO_BULLET_REGEX.test(line) || SCENARIO_NUMBERED_REGEX.test(line);
    if (!isNewListMarker && listItems.length > 0 && listType) {
      const idx = listItems.length - 1;
      listItems[idx] = `${listItems[idx]} ${line.trim()}`.replace(/\s{2,}/g, " ").trim();
      continue;
    }

    if (listItems.length > 0) flushList();
    paragraphLines.push(line.trim());
  }

  flushParagraph();
  flushList();

  return blocks;
}

function splitScenarioProposalText(text: string): { scenarioOnly: string; proposalText: string } {
  const source = String(text ?? "");
  if (!source.trim()) return { scenarioOnly: "", proposalText: "" };

  const proposalMarkerRegex = /(initial\s+idea|proposal|\(aias\s*2\))/i;
  const markerMatch = proposalMarkerRegex.exec(source);
  if (!markerMatch || markerMatch.index < 0) {
    return { scenarioOnly: source.trim(), proposalText: "" };
  }

  const taskOneRegex = /(?:^|\n)\s*task\s*1\b/i;
  const taskOneGlobalMatch = taskOneRegex.exec(source);
  if (taskOneGlobalMatch && taskOneGlobalMatch.index < markerMatch.index) {
    return { scenarioOnly: source.trim(), proposalText: "" };
  }
  const afterMarker = source.slice(markerMatch.index);
  const taskOneAfterMarker = taskOneRegex.exec(afterMarker);
  const taskOneIndex = taskOneAfterMarker ? markerMatch.index + taskOneAfterMarker.index : -1;

  if (taskOneIndex >= 0 && markerMatch.index > taskOneIndex) {
    return { scenarioOnly: source.trim(), proposalText: "" };
  }

  const scenarioOnly = source.slice(0, markerMatch.index).trim();
  const proposalText = (taskOneIndex >= 0 ? source.slice(markerMatch.index, taskOneIndex) : source.slice(markerMatch.index)).trim();
  return { scenarioOnly, proposalText };
}

function renderPdfTextBlocks(
  text: string,
  keyPrefix: string,
  options?: {
    equationsById?: Record<string, any>;
    openPdfHref?: string;
    canEditLatex?: boolean;
    onSaveEquationLatex?: (equationId: string, latex: string) => Promise<void> | void;
    reflowWrappedLines?: boolean;
  }
) {
  const blocks = formatPdfTextToBlocks(text, { reflowWrappedLines: options?.reflowWrappedLines });

  const renderLineWithTypography = (line: string, lineKey: string) => {
    const raw = String(line || "");
    const trimmed = raw.trim();
    if (!trimmed) return <div key={lineKey} className="h-3" />;

    const alphaPart = trimmed.match(/^([a-z])\)\s+([\s\S]+)$/i);
    if (alphaPart) {
      return (
        <div key={lineKey} className="leading-7">
          <span className="font-semibold underline decoration-zinc-300 underline-offset-2">{alphaPart[1]})</span>{" "}
          {renderInlineText(alphaPart[2], options)}
        </div>
      );
    }

    const romanPart = trimmed.match(/^([ivxlcdm]+)\)\s+([\s\S]+)$/i);
    if (romanPart) {
      return (
        <div key={lineKey} className="leading-7">
          <span className="font-semibold underline decoration-zinc-300 underline-offset-2">{romanPart[1]})</span>{" "}
          {renderInlineText(romanPart[2], options)}
        </div>
      );
    }

    const note = trimmed.match(/^(Note:)\s*([\s\S]*)$/i);
    if (note) {
      return (
        <div key={lineKey} className="leading-7">
          <span className="font-semibold">{note[1]}</span>{" "}
          {renderInlineText(note[2], options)}
        </div>
      );
    }

    const headingLike = /^(Task\s+\d+|Vocational Scenario|Use the z-table|Sources of information)/i.test(trimmed);
    if (headingLike) {
      return (
        <div key={lineKey} className="leading-7 font-semibold">
          {renderInlineText(trimmed, options)}
        </div>
      );
    }

    return (
      <div key={lineKey} className="leading-7">
        {renderInlineText(raw, options)}
      </div>
    );
  };

  return blocks.map((block, index) =>
    block.type === "paragraph" ? (
      <div key={`${keyPrefix}-p-${index}`} className="mt-2">
        {String(block.text || "")
          .split("\n")
          .map((line, lineIdx) => renderLineWithTypography(line, `${keyPrefix}-p-${index}-line-${lineIdx}`))}
      </div>
    ) : block.listType === "ol" ? (
      <ol key={`${keyPrefix}-ol-${index}`} className="mt-2 list-decimal space-y-2 pl-6">
        {block.items.map((item, itemIndex) => (
          <li key={`${keyPrefix}-li-${index}-${itemIndex}`} className="leading-7">
            {renderInlineText(item, options)}
          </li>
        ))}
      </ol>
    ) : (
      <ul key={`${keyPrefix}-ul-${index}`} className="mt-2 list-disc space-y-2 pl-6">
        {block.items.map((item, itemIndex) => (
          <li key={`${keyPrefix}-li-${index}-${itemIndex}`} className="leading-7">
            {renderInlineText(item, options)}
          </li>
        ))}
      </ul>
    )
  );
}

function extractIntroBeforeFirstPartMarker(text: string, firstPartKey: string | null): string {
  const source = normalizeText(text || "");
  if (!source || !firstPartKey) return "";
  const marker = new RegExp(`(?:^|\\n)\\s*${firstPartKey}[\\)\\.]\\s+`, "i");
  const match = marker.exec(source);
  if (!match || typeof match.index !== "number") return "";
  return source.slice(0, match.index).trim();
}

function buildStructuredParts(partsInput: unknown): StructuredPart[] {
  if (!Array.isArray(partsInput)) return [];

  const topLevel: StructuredPart[] = [];
  const byKey = new Map<string, StructuredPart>();

  const ensurePart = (letterKey: string) => {
    let existing = byKey.get(letterKey);
    if (!existing) {
      existing = { key: letterKey, text: "", children: [] };
      byKey.set(letterKey, existing);
      topLevel.push(existing);
    }
    return existing;
  };

  for (const rawPart of partsInput) {
    const key = String((rawPart as any)?.key || "").trim().toLowerCase();
    const text = normalizeText(String((rawPart as any)?.text || ""));
    if (!key) continue;

    const letterMatch = key.match(/^([a-z])$/);
    if (letterMatch) {
      const parent = ensurePart(letterMatch[1]);
      if (text) parent.text = text;
      continue;
    }

    const nestedMatch = key.match(/^([a-z])\.([ivxlcdm]+)$/i);
    if (nestedMatch) {
      const parentKey = nestedMatch[1].toLowerCase();
      const romanKey = nestedMatch[2].toLowerCase();
      const parent = ensurePart(parentKey);
      if (text) parent.children.push({ key: romanKey, text });
    }
  }

  return topLevel.filter((part) => part.text || part.children.length > 0);
}

function renderStructuredParts(
  parts: StructuredPart[],
  keyPrefix: string,
  options?: {
    equationsById?: Record<string, any>;
    openPdfHref?: string;
    canEditLatex?: boolean;
    onSaveEquationLatex?: (equationId: string, latex: string) => Promise<void> | void;
    suppressInlineSamplePowerTable?: boolean;
    samplePowerTableBlock?: StructuredTableBlock | null;
    reflowWrappedLines?: boolean;
  }
) {
  return (
    <div className="space-y-2 leading-7">
      {parts.map((part, partIndex) => (
        <div key={`${keyPrefix}-part-${part.key}-${partIndex}`} className="flex items-start gap-2">
          <span className="min-w-[1.5rem] font-medium text-zinc-700">{part.key})</span>
          <div className="min-w-0 flex-1">
            {part.text ? (() => {
              const cleanPartText = options?.suppressInlineSamplePowerTable
                ? stripInlineSamplePowerTable(part.text)
                : part.text;
              if (!cleanPartText) return null;
              return (
                <div>
                  {renderPdfTextBlocks(
                    cleanPartText,
                    `${keyPrefix}-parttext-${part.key}-${partIndex}`,
                    { ...options, reflowWrappedLines: options?.reflowWrappedLines }
                  )}
                </div>
              );
            })() : null}
          {part.key === "a" && options?.samplePowerTableBlock ? (
            <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-300 bg-white">
              <table className="min-w-full border-collapse text-left text-xs text-zinc-800">
                <thead className="bg-zinc-100">
                  <tr>
                    {options.samplePowerTableBlock.headers.map((header: string, idx: number) => (
                      <th
                        key={`${keyPrefix}-sample-h-${idx}`}
                        className="border border-zinc-300 px-3 py-2 font-semibold"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {options.samplePowerTableBlock.rows.map((row: string[], rowIdx: number) => (
                    <tr key={`${keyPrefix}-sample-r-${rowIdx}`}>
                      {row.map((cell, cellIdx: number) => (
                        <td
                          key={`${keyPrefix}-sample-c-${rowIdx}-${cellIdx}`}
                          className="border border-zinc-300 px-3 py-2 align-top"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {part.children.length ? (
            <div className="mt-2 space-y-2 pl-4 leading-7">
              {part.children.map((child, childIndex) => (
                <div key={`${keyPrefix}-subpart-${part.key}-${child.key}-${childIndex}`} className="flex items-start gap-2">
                  <span className="min-w-[2rem] font-medium text-zinc-600">{child.key})</span>
                  <div className="min-w-0 flex-1">
                    {(() => {
                      const cleanChildText = options?.suppressInlineSamplePowerTable
                        ? stripInlineSamplePowerTable(child.text)
                        : child.text;
                      if (!cleanChildText) return null;
                      return renderPdfTextBlocks(
                        cleanChildText,
                        `${keyPrefix}-subparttext-${part.key}-${child.key}-${childIndex}`,
                        { ...options, reflowWrappedLines: options?.reflowWrappedLines }
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          </div>
        </div>
      ))}
    </div>
  );
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
  equationsById,
  openPdfHref,
  canEditLatex,
  onSaveEquationLatex,
}: TaskCardProps) {
  const [expandedLocal, setExpandedLocal] = useState(!!defaultExpanded);
  const [showDiff, setShowDiff] = useState(false);
  const [showWarningDetails, setShowWarningDetails] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [debugCopyStatus, setDebugCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  const expanded = typeof forcedExpanded === "boolean" ? forcedExpanded : expandedLocal;

  // -- Memoized Data Derivation --
  
  const label = task?.label || (task?.n ? `Task ${task.n}` : "Task");
  const criteria = getCriteria(task);
  const totalWords = useMemo(() => wordCount(task?.text || ""), [task?.text]);
  const pages = Array.isArray(task?.pages) ? task.pages.filter(Boolean) : [];
  
  const confidence: TaskConfidence = overrideApplied
    ? "OVERRIDDEN"
    : task?.confidence === "HEURISTIC" ? "HEURISTIC" : "CLEAN";

  const rawWarningItems: string[] = Array.isArray(task?.warnings)
    ? task.warnings.map((w: unknown) => String(w))
    : [];
  const aiCorrected = !!task?.aiCorrected || rawWarningItems.some((w) => /openai math cleanup applied/i.test(w));
  const warningItems = rawWarningItems.filter((w) => !/openai math cleanup applied/i.test(w));
  const effectiveConfidence: TaskConfidence =
    confidence === "HEURISTIC" && warningItems.length === 0 ? "CLEAN" : confidence;
  const hasMathLayoutWarning = warningItems.some((w) => /math layout: broken line wraps/i.test(w));

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
  const extractedScenarioText = typeof task?.scenarioText === "string" ? task.scenarioText.trim() : "";
  const scenarioText = extractedScenarioText || introText;
  const { scenarioOnly, proposalText } = useMemo(() => splitScenarioProposalText(scenarioText), [scenarioText]);
  const scenarioDisplayText = proposalText ? scenarioOnly : scenarioText;
  const contextualIntroLine = useMemo(() => {
    if (!introText || !extractedScenarioText) return "";
    const introNorm = normalizeComparable(introText);
    const scenarioNorm = normalizeComparable(extractedScenarioText);
    if (!introNorm || !scenarioNorm) return "";
    if (scenarioNorm.includes(introNorm)) return "";
    return introText;
  }, [introText, extractedScenarioText]);
  const displayContextLines = useMemo(() => {
    const lines = [...contextLines];
    if (contextualIntroLine) {
      const introNorm = normalizeComparable(contextualIntroLine);
      const exists = lines.some((line) => normalizeComparable(line) === introNorm);
      if (!exists) lines.unshift(contextualIntroLine);
    }
    return lines;
  }, [contextLines, contextualIntroLine]);
  const taskBodyText = useMemo(
    () => normalizeText(bodyTextWithoutIntro || textWithoutContext),
    [bodyTextWithoutIntro, textWithoutContext]
  );

  const tableBlocks = useMemo(() => detectTableBlocks({ ...task, text: taskBodyText }), [task, taskBodyText]);
  const samplePowerTableBlock = useMemo(
    () =>
      tableBlocks.find(
        (block): block is StructuredTableBlock =>
          block.kind === "TABLE" &&
          Array.isArray(block.headers) &&
          String(block.headers[0] || "").toLowerCase() === "sample"
      ) || null,
    [tableBlocks]
  );
  const hasSamplePowerTableBlock = useMemo(
    () => !!samplePowerTableBlock,
    [samplePowerTableBlock]
  );
  const hasTaskParts = Array.isArray(task?.parts) && task.parts.length > 0;

  const contentSegments = useMemo<RenderSegment[]>(() => {
    if (!taskBodyText) return [];
    const lines = taskBodyText.split("\n");
    const tableSegments = tableBlocks
      .filter((block): block is StructuredTableBlock => block?.kind === "TABLE" && !!block?.range)
      .filter((block) => !(hasTaskParts && hasSamplePowerTableBlock && block === samplePowerTableBlock))
      .sort((a, b) => (a.range.startLine || 0) - (b.range.startLine || 0));

    if (!tableSegments.length) {
      return [{ type: "text", text: taskBodyText }];
    }

    const segments: RenderSegment[] = [];
    let cursor = 0;

    tableSegments.forEach((tableBlock) => {
      const startLine = Math.max(0, Number(tableBlock.range?.startLine || 0));
      const endLine = Math.max(startLine, Number(tableBlock.range?.endLine || startLine));
      if (startLine > cursor) {
        const text = lines.slice(cursor, startLine).join("\n").trim();
        if (text) segments.push({ type: "text", text });
      }
      segments.push({ type: "table", block: tableBlock });
      cursor = Math.max(cursor, endLine);
    });

    if (cursor < lines.length) {
      const tail = lines.slice(cursor).join("\n").trim();
      if (tail) segments.push({ type: "text", text: tail });
    }

    return segments;
  }, [taskBodyText, tableBlocks, hasTaskParts, hasSamplePowerTableBlock, samplePowerTableBlock]);

  const structuredParts = useMemo(() => buildStructuredParts(task?.parts), [task?.parts]);
  const hasStructuredParts = structuredParts.length > 0;
  const firstTextSegmentIndex = useMemo(
    () => contentSegments.findIndex((segment) => segment.type === "text"),
    [contentSegments]
  );
  const structuredPartsIntroText = useMemo(() => {
    const titleOnly = normalizeText(String(task?.title || ""));
    if (titleOnly) return titleOnly;
    const firstKey = structuredParts[0]?.key || null;
    return extractIntroBeforeFirstPartMarker(taskBodyText, firstKey);
  }, [structuredParts, task?.title, taskBodyText]);

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

  const handleCopyDebugPayload = async () => {
    const tokenRe = /\[\[EQ:([^\]]+)\]\]/g;
    const ids = new Set<string>();
    const collectIds = (value: unknown) => {
      const txt = String(value || "");
      let m: RegExpExecArray | null;
      while ((m = tokenRe.exec(txt))) {
        if (m[1]) ids.add(m[1]);
      }
    };
    collectIds(task?.text);
    collectIds(task?.prompt);
    if (Array.isArray(task?.parts)) {
      for (const p of task.parts) collectIds(p?.text);
    }
    const payload = {
      n: task?.n ?? null,
      label,
      confidence,
      effectiveConfidence,
      warnings: warningItems,
      pages,
      text: String(task?.text || ""),
      prompt: String(task?.prompt || ""),
      parts: Array.isArray(task?.parts) ? task.parts : [],
      equations: Array.from(ids).map((id) => ({ id, ...(equationsById?.[id] || null) })),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setDebugCopyStatus("copied");
    } catch {
      setDebugCopyStatus("failed");
    }
    setTimeout(() => setDebugCopyStatus("idle"), 2200);
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-all">
      {/* --- Header Section --- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pill cls="bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200">{label}</Pill>
            <Pill cls={confidenceTone(effectiveConfidence)}>
              {effectiveConfidence === "OVERRIDDEN" ? "Overridden" : effectiveConfidence === "HEURISTIC" ? "Warnings" : "Clean"}
            </Pill>
            {aiCorrected ? (
              <Pill cls="bg-sky-50 text-sky-800 ring-1 ring-sky-200">AI corrected</Pill>
            ) : null}
            <Pill cls="bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200">{totalWords} words</Pill>
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
            onClick={handleCopyDebugPayload}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
              debugCopyStatus === "copied"
                ? "border-sky-200 bg-sky-50 text-sky-700"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {debugCopyStatus === "copied" ? "Debug copied" : debugCopyStatus === "failed" ? "Debug failed" : "Copy debug"}
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
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          {scenarioDisplayText && (
            <div className="col-span-full w-full lg:[grid-column:1/-1] rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-700">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Vocational Scenario or Context</div>
              <div className="break-words">
                {renderPdfTextBlocks(scenarioDisplayText, "scenario", {
                  equationsById,
                  openPdfHref,
                  canEditLatex,
                  onSaveEquationLatex,
                  reflowWrappedLines: true,
                })}
              </div>
            </div>
          )}

          {proposalText && (
            <div className="col-span-full w-full lg:[grid-column:1/-1] rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-700">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Proposal Activity (AIAS 2)</div>
              <div className="break-words">
                {renderPdfTextBlocks(proposalText, "proposal", {
                  equationsById,
                  openPdfHref,
                  canEditLatex,
                  onSaveEquationLatex,
                  reflowWrappedLines: hasMathLayoutWarning,
                })}
              </div>
            </div>
          )}

          <div className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
            
            {/* Context Lines */}
            {displayContextLines.length > 0 && (
              <div className="mb-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500">
                <div className="font-semibold text-zinc-600">Context line</div>
                <div className="mt-1 text-sm text-zinc-700 break-words">
                  {renderPdfTextBlocks(displayContextLines[0], "context-line", {
                    equationsById,
                    openPdfHref,
                    canEditLatex,
                    onSaveEquationLatex,
                    reflowWrappedLines: hasMathLayoutWarning,
                  })}
                </div>
              </div>
            )}

            <div className="mb-3 rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-700">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">{label}</div>
              <div className="mt-2 space-y-3">
                {hasStructuredParts && firstTextSegmentIndex < 0 ? (
                  <div className="break-words">
                    {structuredPartsIntroText ? (
                      <div>
                        {renderPdfTextBlocks(structuredPartsIntroText, "task-intro-no-segment", {
                          equationsById,
                          openPdfHref,
                          canEditLatex,
                          onSaveEquationLatex,
                          reflowWrappedLines: hasMathLayoutWarning,
                        })}
                      </div>
                    ) : null}
                    <div className={structuredPartsIntroText ? "mt-2" : ""}>
                      {renderStructuredParts(structuredParts, "task-parts-no-segment", {
                        equationsById,
                        openPdfHref,
                        canEditLatex,
                        onSaveEquationLatex,
                        suppressInlineSamplePowerTable: hasSamplePowerTableBlock,
                        samplePowerTableBlock,
                        reflowWrappedLines: hasMathLayoutWarning,
                      })}
                    </div>
                  </div>
                ) : null}
                {contentSegments.map((segment, segmentIndex) =>
                  segment.type === "text" ? (
                    <div key={`text-${segmentIndex}`} className="break-words">
                      {hasStructuredParts ? (
                        segmentIndex === firstTextSegmentIndex ? (
                          <>
                            {structuredPartsIntroText ? (
                              <div>
                                {renderPdfTextBlocks(structuredPartsIntroText, `task-intro-${segmentIndex}`, {
                                  equationsById,
                                  openPdfHref,
                                  canEditLatex,
                                  onSaveEquationLatex,
                                  reflowWrappedLines: hasMathLayoutWarning,
                                })}
                              </div>
                            ) : null}
                            <div className={structuredPartsIntroText ? "mt-2" : ""}>
                              {renderStructuredParts(structuredParts, `task-parts-${segmentIndex}`, {
                                equationsById,
                                openPdfHref,
                                canEditLatex,
                                onSaveEquationLatex,
                                suppressInlineSamplePowerTable: hasSamplePowerTableBlock,
                                samplePowerTableBlock,
                                reflowWrappedLines: hasMathLayoutWarning,
                              })}
                            </div>
                          </>
                        ) : null
                      ) : (
                        renderPdfTextBlocks(segment.text, `task-text-${segmentIndex}`, {
                          equationsById,
                          openPdfHref,
                          canEditLatex,
                          onSaveEquationLatex,
                          reflowWrappedLines: hasMathLayoutWarning,
                        })
                      )}
                    </div>
                  ) : (
                    <div key={`table-${segmentIndex}`} className="space-y-2">
                      {segment.block.caption ? (
                        <div className="text-xs font-semibold text-zinc-700">{segment.block.caption}</div>
                      ) : null}
                      <div className="overflow-x-auto rounded-lg border border-zinc-300 bg-white">
                        <table className="min-w-full border-collapse text-left text-xs text-zinc-800">
                          <thead className="bg-zinc-100">
                            <tr>
                              {segment.block.headers.map((header: string, idx: number) => (
                                <th
                                  key={`h-${segmentIndex}-${idx}`}
                                  className="border border-zinc-300 px-3 py-2 font-semibold"
                                >
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {segment.block.rows.map((row: string[], rowIdx: number) => (
                              <tr key={`r-${segmentIndex}-${rowIdx}`}>
                                {row.map((cell, cellIdx) => (
                                  <td
                                    key={`c-${segmentIndex}-${rowIdx}-${cellIdx}`}
                                    className="border border-zinc-300 px-3 py-2 align-top"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

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
