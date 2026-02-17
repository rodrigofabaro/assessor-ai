"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pill } from "./ui";
import { detectTableBlocks, type StructuredTableBlock } from "@/lib/extraction/render/tableBlocks";
import { extractIntroBeforeParts } from "@/lib/extraction/render/parseParts";
import InlineEquationText from "./InlineEquationText";
import { convertWordLinearToLatex } from "@/lib/math/wordLinearToLatex";
import { computeEffectiveTaskConfidence, computeEffectiveTaskWarnings, isTaskAiCorrected } from "@/lib/briefs/warnings";

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
  anchorId?: string;
  taskLatexOverrides?: Record<string, string>;
  equationsById?: Record<string, any>;
  openPdfHref?: string;
  canEditLatex?: boolean;
  onSaveEquationLatex?: (equationId: string, latex: string) => Promise<void> | void;
  onSaveTaskLatexOverrides?: (taskNumber: number, overridesByPart: Record<string, string>) => Promise<void> | void;
  showSidebar?: boolean;
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

type ChartKind = "bar" | "pie";

type ChartDatum = {
  label: string;
  value: number;
};

type TaskChartSpec = {
  id: string;
  partKey: string;
  kind: ChartKind;
  title: string;
  data: ChartDatum[];
  confidence: number;
  note?: string;
  unit?: string;
  pending?: boolean;
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

  const smartReflowParagraph = (linesIn: string[]) => {
    if (!linesIn.length) return "";
    const lines = linesIn.map((line) => line.replace(/[ \t]+$/g, "").trim()).filter(Boolean);
    if (!lines.length) return "";
    const out: string[] = [lines[0]];
    const isHardBreakLine = (line: string) =>
      /^(\[\[(?:EQ|IMG):[^\]]+\]\]|[a-z]\)|[ivxlcdm]+\)|PART\s+\d+|Task\s+\d+)/i.test(line);
    const endsSentence = (line: string) => /[.!?;:)]\s*$/.test(line);
    for (let i = 1; i < lines.length; i += 1) {
      const cur = lines[i];
      const prev = out[out.length - 1] || "";
      const keepBreak =
        isHardBreakLine(cur) ||
        isHardBreakLine(prev) ||
        endsSentence(prev);
      if (keepBreak) {
        out.push(cur);
      } else {
        out[out.length - 1] = `${prev} ${cur}`.replace(/[ \t]{2,}/g, " ").trim();
      }
    }
    return out.join("\n");
  };

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    const text = (
      options?.reflowWrappedLines ? smartReflowParagraph(paragraphLines) : paragraphLines.join("\n")
    )
      .replace(/[ \t]{2,}/g, " ")
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
  const stripDuplicateEqLineForDisplay = (rawText: string) => {
    const canonical = (s: string) =>
      String(s || "")
        .toLowerCase()
        .replace(/\\theta/g, "θ")
        .replace(/\\alpha/g, "α")
        .replace(/\\beta/g, "β")
        .replace(/\\sin/g, "sin")
        .replace(/\\cos/g, "cos")
        .replace(/\\tan/g, "tan")
        .replace(/[{}\\]/g, "")
        .replace(/[^\p{L}\p{N}()+\-*/=]/gu, "");
    const looksEqLine = (s: string) =>
      /[=()+\-*/^]/.test(s) || /\b(sin|cos|tan|log|ln)\b/i.test(s) || /[αβθ]/i.test(s);

    const lines = String(rawText || "").split("\n");
    const out: string[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] || "";
      out.push(line);
      const m = line.match(/^\s*\[\[EQ:([^\]]+)\]\]\s*$/);
      if (!m) continue;
      const eq = options?.equationsById?.[m[1]];
      const latex = String(eq?.latex || "").trim();
      if (!latex) continue;
      let j = i + 1;
      while (j < lines.length && !String(lines[j] || "").trim()) {
        out.push(lines[j] || "");
        j += 1;
      }
      if (j >= lines.length) continue;
      const next = String(lines[j] || "").trim();
      if (!next || !looksEqLine(next)) continue;
      const nextCanon = canonical(next);
      const latexCanon = canonical(latex);
      if (nextCanon && latexCanon && (nextCanon === latexCanon || nextCanon.endsWith(latexCanon) || latexCanon.endsWith(nextCanon))) {
        i = j; // skip duplicate equation text line in display
      }
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n");
  };

  const normalizeEquationLatex = (raw: string) => {
    return String(raw || "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/−/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\blog_e\s*\(/gi, "\\log_{e}(")
      .replace(/\be\^\s*-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
      .replace(/\be\s*-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
      .replace(/\be-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
      .replace(/\b(sin|cos|tan)\s*\(/gi, (_m, fn) => `\\${String(fn).toLowerCase()}(`);
  };

  const maybeRenderEquationLine = (content: string, lineKey: string) => {
    const t = String(content || "").trim();
    const rhs = t.replace(/^[A-Za-z][A-Za-z0-9_]*\s*=\s*/, "");
    const words = rhs.match(/[A-Za-z]{4,}/g) || [];
    const narrativeWordCount = words.filter((w) =>
      /^(the|then|number|characters|email|address|example|assuming|determine|approximate|value|values|state|year|birth|arrive|voltage|would)$/i.test(w)
    ).length;
    const looksNarrative = words.length >= 4 || narrativeWordCount >= 2;
    const isEqLike =
      /^[A-Za-z][A-Za-z0-9_]*\s*=/.test(t) &&
      /[0-9^()+\-*/]|log_e|sin|cos|tan|e\^?/i.test(t) &&
      !looksNarrative;
    if (!isEqLike) return null;
    const latex = normalizeEquationLatex(t);
    return (
      <span key={lineKey} className="inline-block align-middle">
        {renderInlineText(`[[MATH:${latex}]]`, options)}
      </span>
    );
  };

  const collapseWrappedPartLines = (rawText: string) => {
    const lines = String(rawText || "").split("\n");
    const out: string[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = String(lines[i] || "").trim();
      if (!line) {
        out.push("");
        continue;
      }
      const partOnly = line.match(/^([a-z]|[ivxlcdm]+)\)\s*$/i);
      if (!partOnly) {
        out.push(lines[i]);
        continue;
      }
      let merged = `${partOnly[1]})`;
      let j = i + 1;
      while (j < lines.length) {
        const next = String(lines[j] || "").trim();
        if (!next) break;
        if (/^([a-z]|[ivxlcdm]+)\)\s*$/i.test(next)) break;
        if (/^(Task\s+\d+|Vocational Scenario|Use the z-table|Sources of information)/i.test(next)) break;
        // Preserve standalone token lines so equations/images render on their own line.
        if (/^\[\[(?:EQ|IMG):[^\]]+\]\]$/i.test(next)) break;
        merged += ` ${next}`;
        j += 1;
      }
      out.push(merged);
      i = j - 1;
    }
    return out.join("\n");
  };

  const cleanedText = stripDuplicateEqLineForDisplay(String(text || ""));
  const blocks = formatPdfTextToBlocks(cleanedText, { reflowWrappedLines: options?.reflowWrappedLines });

  const renderLineWithTypography = (line: string, lineKey: string) => {
    const raw = String(line || "");
    const trimmed = raw.trim();
    if (!trimmed) return <div key={lineKey} className="h-3" />;

    const alphaPart = trimmed.match(/^([a-z])\)\s+([\s\S]+)$/i);
    if (alphaPart) {
      const maybeEq = maybeRenderEquationLine(alphaPart[2], `${lineKey}-eq`);
      return (
        <div key={lineKey} className="leading-7">
          <span className="font-semibold underline decoration-zinc-300 underline-offset-2">{alphaPart[1]})</span>{" "}
          {maybeEq ?? renderInlineText(alphaPart[2], options)}
        </div>
      );
    }

    const romanPart = trimmed.match(/^([ivxlcdm]+)\)\s+([\s\S]+)$/i);
    if (romanPart) {
      const maybeEq = maybeRenderEquationLine(romanPart[2], `${lineKey}-eq`);
      return (
        <div key={lineKey} className="leading-7">
          <span className="font-semibold underline decoration-zinc-300 underline-offset-2">{romanPart[1]})</span>{" "}
          {maybeEq ?? renderInlineText(romanPart[2], options)}
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

    const maybeEq = maybeRenderEquationLine(trimmed, `${lineKey}-eq`);
    if (maybeEq) {
      return (
        <div key={lineKey} className="leading-7">
          {maybeEq}
        </div>
      );
    }

    const headingLike = /^(Task\s+\d+\s*[:\-]?\s*|Vocational Scenario|Use the z-table|Sources of information)$/i.test(trimmed);
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
        {collapseWrappedPartLines(String(block.text || ""))
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
  let currentParentKey: string | null = null;

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
      currentParentKey = letterMatch[1];
      continue;
    }

    const nestedMatch = key.match(/^([a-z])\.([ivxlcdm]+|\d+)$/i);
    if (nestedMatch) {
      const parentKey = nestedMatch[1].toLowerCase();
      const childKey = nestedMatch[2].toLowerCase();
      const parent = ensurePart(parentKey);
      if (text) parent.children.push({ key: childKey, text });
      currentParentKey = parentKey;
      continue;
    }

    // Many briefs emit flat numeric parts after letter headers (a, 1, 2, b, 1, 2).
    // Attach these to the most recently seen letter parent so sub-questions render.
    const implicitChildMatch = key.match(/^(\d+|[ivxlcdm]+)$/i);
    if (implicitChildMatch && currentParentKey) {
      const parent = ensurePart(currentParentKey);
      if (text) parent.children.push({ key, text });
    }
  }

  return topLevel.filter((part) => part.text || part.children.length > 0);
}

function normalizeManualLatex(raw: string) {
  return String(raw || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/−/g, "-")
    .replace(/\blog_e\s*\(/gi, "\\log_{e}(")
    .replace(/\be\^\s*-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
    .replace(/\be\s*-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
    .replace(/\be-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
    .trim();
}

function parseLabelValueRows(text: string): ChartDatum[] {
  const lines = normalizeText(String(text || "")).split("\n");
  const out: ChartDatum[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const clean = line.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    if (/^you must[:]?$/i.test(clean)) continue;
    if (/^failure reason/i.test(clean) && /number of chips/i.test(clean)) continue;
    if (/^(task|part)\s+\d+/i.test(clean)) continue;
    const m = clean.match(/^(.+?)\s+(-?\d+(?:\.\d+)?)\s*%?\s*$/);
    if (!m) continue;
    const label = String(m[1] || "").trim().replace(/[:\-]+$/g, "").trim();
    const value = Number(m[2]);
    if (!label || !Number.isFinite(value)) continue;
    const key = `${label.toLowerCase()}::${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, value });
  }
  return out;
}

function inferChartTitle(part: StructuredPart): string {
  const firstLine = normalizeText(String(part?.text || "")).split("\n").map((l) => l.trim()).find(Boolean) || "";
  if (!firstLine) return `Part ${part.key.toUpperCase()} Data`;
  if (firstLine.length <= 80) return firstLine.replace(/[:\-]\s*$/g, "");
  const m = firstLine.match(/^(.{1,80}?)(?:\s+-\s+|:\s+)/);
  return m ? m[1].trim() : `Part ${part.key.toUpperCase()} Data`;
}

function scoreChartConfidence(input: {
  dataCount: number;
  wantsBar: boolean;
  wantsPie: boolean;
  hasGenericChartCue: boolean;
  imageBasedCue: boolean;
  pending: boolean;
}) {
  const {
    dataCount,
    wantsBar,
    wantsPie,
    hasGenericChartCue,
    imageBasedCue,
    pending,
  } = input;

  let score = 0.34;
  if (wantsBar || wantsPie) score += 0.16;
  if (hasGenericChartCue) score += 0.1;
  if (imageBasedCue) score += 0.18;

  if (!pending) {
    score += 0.18;
    score += Math.min(0.2, Math.max(0, dataCount - 2) * 0.04);
  }

  const min = pending ? 0.35 : 0.55;
  const max = pending ? 0.75 : 0.98;
  return Math.max(min, Math.min(max, score));
}

function buildChartSpecs(parts: StructuredPart[], fallbackBodyText: string): TaskChartSpec[] {
  const specs: TaskChartSpec[] = [];

  const addSpecsFor = (partKey: string, title: string, sourceText: string, instructionText: string) => {
    const data = parseLabelValueRows(sourceText);
    const sourceAndInstructions = `${sourceText}\n${instructionText}`;
    const instruction = sourceAndInstructions.toLowerCase();
    const wantsBar = /\bbar\s+chart\b|\bbar\s+graph\b/.test(instruction);
    const wantsPie = /\bpie\s+chart\b|\bpie\s+graph\b/.test(instruction);
    const hasGenericChartCue = /\b(chart|graph)\b/.test(instruction);
    const imageBasedCue =
      /\[\[img:[^\]]+\]\]/i.test(sourceAndInstructions) ||
      /\b(graph|chart|figure|diagram)\s+(shown|below)\b/i.test(sourceAndInstructions);
    const unit = /\bpercentage|%\b/i.test(sourceAndInstructions) ? "%" : undefined;
    const singleDayWarning =
      /\b5-?\s*day\b/i.test(instructionText) && data.length <= 5
        ? "Showing sample/day data extracted from the brief text."
        : undefined;

    // Only build chart previews when this specific part/task actually cues chart/graph work.
    const hasChartRequirement = wantsBar || wantsPie || hasGenericChartCue || imageBasedCue;
    if (!hasChartRequirement) return;

    const kinds: ChartKind[] = [];
    if (wantsBar) kinds.push("bar");
    if (wantsPie) kinds.push("pie");
    if (!kinds.length) kinds.push("bar");

    if (data.length < 2) {
      if (!kinds.length) return;
      const pendingConfidence = scoreChartConfidence({
        dataCount: data.length,
        wantsBar,
        wantsPie,
        hasGenericChartCue,
        imageBasedCue,
        pending: true,
      });
      for (const kind of kinds) {
        specs.push({
          id: `${partKey}-${kind}-pending`,
          partKey,
          kind,
          title,
          data: [],
          confidence: pendingConfidence,
          pending: true,
          note: imageBasedCue
            ? "Chart appears image-based in the source PDF. Numeric series was not extracted yet."
            : "Chart is required by this task, but numeric series was not extracted from text.",
          unit,
        });
      }
      return;
    }

    const confidence = scoreChartConfidence({
      dataCount: data.length,
      wantsBar,
      wantsPie,
      hasGenericChartCue,
      imageBasedCue,
      pending: false,
    });
    for (const kind of kinds) {
      specs.push({
        id: `${partKey}-${kind}`,
        partKey,
        kind,
        title,
        data,
        confidence,
        note: singleDayWarning,
        unit,
      });
    }
  };

  if (parts.length > 0) {
    for (const part of parts) {
      const instructionText = [part.text, ...part.children.map((c) => c.text)].join("\n");
      addSpecsFor(part.key, inferChartTitle(part), part.text, instructionText);
    }
  } else {
    addSpecsFor("task", "Task Data", fallbackBodyText, fallbackBodyText);
  }

  return specs;
}

function formatChartValue(value: number, unit?: string) {
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");
  return unit === "%" ? `${rounded}%` : rounded;
}

function ChartPreview({ spec, openPdfHref }: { spec: TaskChartSpec; openPdfHref?: string }) {
  const total = spec.data.reduce((sum, d) => sum + Math.max(0, d.value), 0);
  const max = Math.max(1, ...spec.data.map((d) => d.value));

  const pieStops: string[] = [];
  const colors = ["#0f172a", "#334155", "#475569", "#64748b", "#94a3b8", "#22c55e", "#f59e0b", "#ef4444"];
  let cursor = 0;
  spec.data.forEach((d, idx) => {
    const pct = total > 0 ? (Math.max(0, d.value) / total) * 100 : 0;
    const next = cursor + pct;
    const color = colors[idx % colors.length];
    pieStops.push(`${color} ${cursor}% ${next}%`);
    cursor = next;
  });

  return (
    <div className="rounded-lg border border-zinc-300 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
            {spec.kind === "bar" ? "Bar chart preview" : "Pie chart preview"} - Part {spec.partKey}
          </div>
          <div className="text-sm font-medium text-zinc-900">{spec.title}</div>
        </div>
        <div className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700">
          confidence {Math.round(spec.confidence * 100)}%
        </div>
      </div>

      {spec.note ? <div className="mt-2 text-[11px] text-amber-700">{spec.note}</div> : null}

      {spec.pending ? (
        <div className="mt-3 rounded-md border border-zinc-300 bg-zinc-50 p-3">
          {spec.kind === "bar" ? (
            <div className="space-y-2">
              {[72, 48, 86, 40].map((w, i) => (
                <div key={`${spec.id}-ghost-bar-${i}`} className="grid grid-cols-[90px_1fr_auto] items-center gap-2 text-[11px] text-zinc-700">
                  <div className="truncate">Series {i + 1}</div>
                  <div className="h-3 rounded bg-white">
                    <div className="h-full rounded" style={{ width: `${w}%`, backgroundColor: colors[i % colors.length] }} />
                  </div>
                  <div className="tabular-nums text-zinc-500">N/A</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div
                className="h-24 w-24 shrink-0 rounded-full border border-zinc-300"
                style={{
                  background: "conic-gradient(#0f172a 0% 30%, #334155 30% 55%, #64748b 55% 75%, #94a3b8 75% 100%)",
                }}
              />
              <div className="text-xs text-zinc-700">
                Image-based chart detected. Numeric series is missing from extraction.
                <div className="mt-1 text-zinc-500">Values: N/A</div>
              </div>
            </div>
          )}
          <div className="mt-2 text-[11px] text-zinc-600">Numbers are missing in extracted text; showing placeholder graph.</div>
          {openPdfHref ? (
            <div className="mt-3">
              <a href={openPdfHref} target="_blank" rel="noreferrer" className="text-xs font-semibold text-zinc-900 underline underline-offset-2">
                Open source PDF graph
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      {!spec.pending && spec.kind === "bar" ? (
        <div className="mt-3 space-y-2">
          {spec.data.map((d, idx) => {
            const widthPct = Math.max(4, Math.round((d.value / max) * 100));
            const color = colors[idx % colors.length];
            return (
              <div key={`${spec.id}-${d.label}`} className="grid grid-cols-[minmax(140px,1fr)_3fr_auto] items-center gap-2 text-xs">
                <div className="truncate text-zinc-700">{d.label}</div>
                <div className="h-4 overflow-hidden rounded bg-zinc-100">
                  <div className="h-full rounded" style={{ width: `${widthPct}%`, backgroundColor: color }} />
                </div>
                <div className="tabular-nums text-zinc-800">{formatChartValue(d.value, spec.unit)}</div>
              </div>
            );
          })}
        </div>
      ) : !spec.pending ? (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div
            className="h-36 w-36 shrink-0 rounded-full border border-zinc-200"
            style={{
              background:
                pieStops.length > 0 ? `conic-gradient(${pieStops.join(", ")})` : "conic-gradient(#e5e7eb 0% 100%)",
            }}
          />
          <div className="min-w-[220px] flex-1 space-y-1 text-xs">
            {spec.data.map((d, idx) => {
              const color = colors[idx % colors.length];
              const pct = total > 0 ? (d.value / total) * 100 : 0;
              return (
                <div key={`${spec.id}-legend-${d.label}`} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
                    <span className="truncate text-zinc-700">{d.label}</span>
                  </div>
                  <div className="tabular-nums text-zinc-800">
                    {formatChartValue(d.value, spec.unit)} ({pct.toFixed(1)}%)
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function renderStructuredParts(
  parts: StructuredPart[],
  keyPrefix: string,
  options?: {
    equationsById?: Record<string, any>;
    openPdfHref?: string;
    canEditLatex?: boolean;
    onSaveEquationLatex?: (equationId: string, latex: string) => Promise<void> | void;
    partLatexOverrides?: Record<string, string>;
    chartsByPart?: Record<string, TaskChartSpec[]>;
    onRecoverChart?: (spec: TaskChartSpec) => Promise<void> | void;
    recoveringChartIds?: Set<string>;
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
              const manualLatex = String(options?.partLatexOverrides?.[part.key] || "").trim();
              if (manualLatex) {
                return (
                  <div>
                    {renderInlineText(`[[MATH:${normalizeManualLatex(manualLatex)}]]`, options)}
                    <div className="mt-1 text-[11px] text-sky-700">Manual LaTeX override</div>
                  </div>
                );
              }
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
          {(() => {
            const partCharts = options?.chartsByPart?.[String(part.key).toLowerCase()] || [];
            if (!partCharts.length) return null;
            return (
            <div className="mt-3 space-y-3">
              {partCharts.map((spec) => (
                <div key={`${keyPrefix}-chart-wrap-${spec.id}`} className="space-y-2">
                  <ChartPreview spec={spec} openPdfHref={options?.openPdfHref} />
                  {spec.pending ? (
                    <button
                      type="button"
                      onClick={() => options?.onRecoverChart?.(spec)}
                      disabled={!options?.onRecoverChart || !!options?.recoveringChartIds?.has(spec.id)}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {options?.recoveringChartIds?.has(spec.id) ? "Recovering chart data..." : "Recover chart numbers (AI)"}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            );
          })()}
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
                      const childKey = `${part.key}.${child.key}`;
                      const manualLatex = String(options?.partLatexOverrides?.[childKey] || "").trim();
                      if (manualLatex) {
                        return (
                          <div>
                            {renderInlineText(`[[MATH:${normalizeManualLatex(manualLatex)}]]`, options)}
                            <div className="mt-1 text-[11px] text-sky-700">Manual LaTeX override</div>
                          </div>
                        );
                      }
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
  anchorId,
  taskLatexOverrides,
  equationsById,
  openPdfHref,
  canEditLatex,
  onSaveEquationLatex,
  onSaveTaskLatexOverrides,
  showSidebar = true,
}: TaskCardProps) {
  const [expandedLocal, setExpandedLocal] = useState(!!defaultExpanded);
  const [showDiff, setShowDiff] = useState(false);
  const [showWarningDetails, setShowWarningDetails] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [debugCopyStatus, setDebugCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [showTaskLatexEditor, setShowTaskLatexEditor] = useState(false);
  const [savingTaskLatex, setSavingTaskLatex] = useState(false);
  const [taskLatexInputMode, setTaskLatexInputMode] = useState<"latex" | "word">("latex");
  const [chartOverrides, setChartOverrides] = useState<Record<string, { data: ChartDatum[]; confidence: number; pending: false; note?: string }>>({});
  const [recoveringChartIds, setRecoveringChartIds] = useState<Set<string>>(new Set());
  const attemptedChartRecoveryRef = useRef<Set<string>>(new Set());

  const expanded = typeof forcedExpanded === "boolean" ? forcedExpanded : expandedLocal;

  // -- Memoized Data Derivation --
  
  const label = task?.label || (task?.n ? `Task ${task.n}` : "Task");
  const criteria = getCriteria(task);
  const totalWords = useMemo(() => wordCount(task?.text || ""), [task?.text]);
  const pages = Array.isArray(task?.pages) ? task.pages.filter(Boolean) : [];
  
  const confidence: TaskConfidence = overrideApplied
    ? "OVERRIDDEN"
    : task?.confidence === "HEURISTIC" ? "HEURISTIC" : "CLEAN";
  const warningItems = useMemo(
    () => computeEffectiveTaskWarnings(task, { equationsById, taskLatexOverrides }),
    [task, equationsById, taskLatexOverrides]
  );
  const aiCorrected = useMemo(() => isTaskAiCorrected(task), [task]);
  const effectiveConfidence: TaskConfidence = useMemo(
    () => computeEffectiveTaskConfidence(task, warningItems, overrideApplied) as TaskConfidence,
    [task, warningItems, overrideApplied]
  );
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
  const baseChartSpecs = useMemo(
    () => buildChartSpecs(structuredParts, taskBodyText),
    [structuredParts, taskBodyText]
  );
  const chartSpecs = useMemo(
    () =>
      baseChartSpecs.map((spec) => {
        const ov = chartOverrides[spec.id];
        if (!ov) return spec;
        return {
          ...spec,
          data: ov.data,
          confidence: ov.confidence,
          pending: false,
          note: ov.note ?? spec.note,
        };
      }),
    [baseChartSpecs, chartOverrides]
  );
  const chartsByPart = useMemo(() => {
    const out: Record<string, TaskChartSpec[]> = {};
    for (const spec of chartSpecs) {
      const key = String(spec?.partKey || "").toLowerCase();
      if (!key || key === "task") continue;
      if (!out[key]) out[key] = [];
      out[key].push(spec);
    }
    return out;
  }, [chartSpecs]);
  const unplacedChartSpecs = useMemo(() => {
    if (!chartSpecs.length) return [] as TaskChartSpec[];
    const partKeys = new Set(structuredParts.map((p) => String(p?.key || "").toLowerCase()).filter(Boolean));
    return chartSpecs.filter((spec) => {
      const key = String(spec?.partKey || "").toLowerCase();
      if (!key || key === "task") return true;
      return !partKeys.has(key);
    });
  }, [chartSpecs, structuredParts]);

  const getReferenceDocumentId = () => {
    const src = String(openPdfHref || "");
    const m = src.match(/\/api\/reference-documents\/([^/]+)\/file/i);
    return m?.[1] || "";
  };

  const recoverChartData = async (spec: TaskChartSpec) => {
    if (!spec?.pending) return;
    const documentId = getReferenceDocumentId();
    if (!documentId) return;
    if (recoveringChartIds.has(spec.id)) return;

    setRecoveringChartIds((prev) => new Set(prev).add(spec.id));
    try {
      const pageGuess = Number((Array.isArray(task?.pages) ? task.pages[0] : 1) || 1);
      const anchorText = String(partTextByKey[String(spec.partKey || "").toLowerCase()] || taskBodyText || "").slice(0, 800);
      const res = await fetch(`/api/reference-documents/${documentId}/chart-recover`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pageNumber: pageGuess, anchorText }),
      });
      const data = await res.json().catch(() => ({}));
      const points = Array.isArray(data?.points)
        ? data.points
            .map((p: any) => ({ label: String(p?.label || "").trim(), value: Number(p?.value) }))
            .filter((p: any) => p.label && Number.isFinite(p.value))
        : [];
      if (!res.ok || points.length < 2) return;

      setChartOverrides((prev) => ({
        ...prev,
        [spec.id]: {
          data: points,
          confidence: Math.max(Number(spec.confidence || 0), Number(data?.confidence || 0.6)),
          pending: false,
          note: `Recovered from PDF image (${String(data?.provider || "ai")}).`,
        },
      }));
    } finally {
      setRecoveringChartIds((prev) => {
        const next = new Set(prev);
        next.delete(spec.id);
        return next;
      });
    }
  };

  useEffect(() => {
    if (!expanded) return;
    const pending = chartSpecs.filter((s) => s.pending);
    if (!pending.length) return;
    for (const spec of pending) {
      if (attemptedChartRecoveryRef.current.has(spec.id)) continue;
      attemptedChartRecoveryRef.current.add(spec.id);
      void recoverChartData(spec);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, chartSpecs]);
  const taskNumber = useMemo(() => {
    const n = Number(task?.n);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [task?.n]);
  const partLatexOverrides = useMemo(() => {
    const out: Record<string, string> = {};
    const src = taskLatexOverrides || {};
    for (const [k, v] of Object.entries(src)) {
      const mk = String(k || "");
      const mv = String(v || "").trim();
      if (!mk || !mv) continue;
      const m = mk.match(/^(\d+)\.(.+)$/);
      if (!m) continue;
      if (Number(m[1]) !== taskNumber) continue;
      out[String(m[2]).toLowerCase()] = mv;
    }
    return out;
  }, [taskLatexOverrides, taskNumber]);
  const [taskLatexDraft, setTaskLatexDraft] = useState<Record<string, string>>({});
  const editablePartKeys = useMemo(() => {
    const keys: string[] = [];
    for (const p of structuredParts) {
      if (p?.key) keys.push(String(p.key).toLowerCase());
      for (const c of p?.children || []) {
        if (c?.key) keys.push(`${String(p.key).toLowerCase()}.${String(c.key).toLowerCase()}`);
      }
    }
    return keys;
  }, [structuredParts]);
  const partTextByKey = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of structuredParts) {
      const pKey = String(p?.key || "").toLowerCase();
      if (pKey) out[pKey] = String(p?.text || "");
      for (const c of p?.children || []) {
        const cKey = `${pKey}.${String(c?.key || "").toLowerCase()}`;
        out[cKey] = String(c?.text || "");
      }
    }
    return out;
  }, [structuredParts]);
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

  const openTaskLatexEditor = () => {
    setTaskLatexDraft(partLatexOverrides);
    setShowTaskLatexEditor(true);
  };

  const saveTaskLatexEditor = async () => {
    if (!onSaveTaskLatexOverrides || !taskNumber) return;
    const next: Record<string, string> = {};
    for (const key of editablePartKeys) {
      const rawVal = String(taskLatexDraft[key] || "").trim();
      const val = taskLatexInputMode === "word" ? convertWordLinearToLatex(rawVal) : rawVal;
      if (val) next[key] = val;
    }
    setSavingTaskLatex(true);
    try {
      await onSaveTaskLatexOverrides(taskNumber, next);
      setShowTaskLatexEditor(false);
    } finally {
      setSavingTaskLatex(false);
    }
  };

  const autoFillTaskLatexEditor = () => {
    const isEquationLike = (line: string) =>
      /^[A-Za-z][A-Za-z0-9_]*\s*=/.test(line) && /[0-9^()+\-*/]|log_e|sin|cos|tan|e\^?/i.test(line);
    const pickEquation = (raw: string) => {
      const lines = String(raw || "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const line of lines) {
        if (line.includes("[[EQ:") || line.includes("[[IMG:")) continue;
        if (isEquationLike(line)) return normalizeManualLatex(line);
      }
      return "";
    };

    const next: Record<string, string> = { ...taskLatexDraft };
    for (const key of editablePartKeys) {
      if (String(next[key] || "").trim()) continue;
      const guessed = pickEquation(partTextByKey[key] || "");
      if (guessed) next[key] = guessed;
    }
    setTaskLatexDraft(next);
  };

  return (
    <div id={anchorId} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-all">
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
            onClick={openTaskLatexEditor}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Edit task LaTeX
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
        <div className={"mt-4 grid grid-cols-1 gap-4 " + (showSidebar ? "lg:grid-cols-[minmax(0,1fr)_240px]" : "")}>
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
                  reflowWrappedLines: true,
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
                                partLatexOverrides,
                                chartsByPart,
                                onRecoverChart: recoverChartData,
                                recoveringChartIds,
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
                                partLatexOverrides,
                                chartsByPart,
                                onRecoverChart: recoverChartData,
                                recoveringChartIds,
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

            {unplacedChartSpecs.length ? (
              <div className="rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm text-zinc-700">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Detected Chart Previews</div>
                <div className="mt-2 space-y-3">
                  {unplacedChartSpecs.map((spec) => (
                    <div key={`unplaced-${spec.id}`} className="space-y-2">
                      <ChartPreview spec={spec} openPdfHref={openPdfHref} />
                      {spec.pending ? (
                        <button
                          type="button"
                          onClick={() => recoverChartData(spec)}
                          disabled={recoveringChartIds.has(spec.id)}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                        >
                          {recoveringChartIds.has(spec.id) ? "Recovering chart data..." : "Recover chart numbers (AI)"}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

          </div>

          {showSidebar ? (
            <TaskSidebar 
              totalWords={totalWords}
              pages={pages}
              confidence={effectiveConfidence}
              warningsCount={warningItems.length}
              tablesCount={tableBlocks.length}
              partsCount={Array.isArray(task?.parts) ? task.parts.length : 0}
            />
          ) : null}
        </div>
      )}

      {/* --- Diff View --- */}
      {showDiff && diffData && (
        <div className="mt-4 grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2">
          <DiffView label="Extracted" lines={diffData.leftLines} diffIndices={diffData.diffIndices} />
          <DiffView label="Current" lines={diffData.rightLines} diffIndices={diffData.diffIndices} />
        </div>
      )}

      {showTaskLatexEditor ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => !savingTaskLatex && setShowTaskLatexEditor(false)} />
          <div className="relative mx-4 w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Task {taskNumber || "?"} manual LaTeX</div>
                <div className="text-xs text-zinc-600">Set per-part LaTeX overrides used by display and saved in metadata.</div>
              </div>
              <button
                type="button"
                disabled={savingTaskLatex}
                onClick={() => setShowTaskLatexEditor(false)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Close
              </button>
            </div>
            <div className="mt-3 max-h-[60vh] overflow-auto space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTaskLatexInputMode("word")}
                    disabled={savingTaskLatex}
                    className={
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 " +
                      (taskLatexInputMode === "word"
                        ? "border-sky-300 bg-sky-50 text-sky-800"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                    }
                  >
                    Word input
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskLatexInputMode("latex")}
                    disabled={savingTaskLatex}
                    className={
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 " +
                      (taskLatexInputMode === "latex"
                        ? "border-sky-300 bg-sky-50 text-sky-800"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                    }
                  >
                    LaTeX input
                  </button>
                </div>
                <button
                  type="button"
                  onClick={autoFillTaskLatexEditor}
                  disabled={savingTaskLatex}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Auto-fill from part text
                </button>
              </div>
              {editablePartKeys.length ? editablePartKeys.map((k) => (
                <div key={`latex-${k}`} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs font-semibold text-zinc-700">Part {k}</div>
                  <textarea
                    value={taskLatexDraft[k] || ""}
                    onChange={(e) => setTaskLatexDraft((d) => ({ ...d, [k]: e.target.value }))}
                    placeholder={taskLatexInputMode === "word" ? "Example: v=5e^-0.2t" : "Example: v=5e^{-0.2t}"}
                    className="mt-2 min-h-[70px] w-full rounded-lg border border-zinc-300 bg-white p-2 font-mono text-xs text-zinc-900"
                  />
                  {taskLatexInputMode === "word" ? (
                    <div className="mt-2 rounded border border-zinc-200 bg-white p-2 text-[11px] text-zinc-700">
                      Converted: <code>{convertWordLinearToLatex(taskLatexDraft[k] || "") || "—"}</code>
                    </div>
                  ) : null}
                </div>
              )) : (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                  No structured parts were detected for this task.
                </div>
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={saveTaskLatexEditor}
                disabled={savingTaskLatex || !onSaveTaskLatexOverrides || !taskNumber}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {savingTaskLatex ? "Saving..." : "Save task LaTeX"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
