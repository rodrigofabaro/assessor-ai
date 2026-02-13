"use client";

import { useMemo, useState } from "react";
import katex from "katex";
import { convertWordLinearToLatex } from "@/lib/math/wordLinearToLatex";

type Equation = {
  id: string;
  pageNumber: number;
  bbox: { x: number; y: number; w: number; h: number };
  latex: string | null;
  confidence: number;
  needsReview: boolean;
  latexSource: "heuristic" | "manual" | null;
};

type Props = {
  text: string;
  equationsById?: Record<string, Equation>;
  openPdfHref?: string;
  canEditLatex?: boolean;
  onSaveLatex?: (equationId: string, latex: string) => Promise<void> | void;
};

const TOKEN_RE = /(\[\[(?:EQ|IMG):[^\]]+\]\])/g;
const HEURISTIC_MATH_TOKEN_RE = /(\[\[MATH:[\s\S]*?\]\])/g;
const URL_RE = /(https?:\/\/[^\s)]+)/g;
const TASK_REF_RE = /\b(Task\s+(\d+)(?:\s+Part\s+([A-Za-z0-9]+))?)\b/g;

function normalizeLatexForRender(latex: string, displayMode: boolean) {
  let out = String(latex || "")
    // Normalize common Unicode subscript variables to ASCII identifiers for downstream matching/splitting.
    .replace(/([A-Za-z])₀/g, "$1_0")
    .replace(/([A-Za-z])₁/g, "$1_1")
    .replace(/([A-Za-z])₂/g, "$1_2")
    .replace(/([A-Za-z])₃/g, "$1_3")
    .replace(/([A-Za-z])₄/g, "$1_4")
    .replace(/([A-Za-z])₅/g, "$1_5")
    .replace(/([A-Za-z])₆/g, "$1_6")
    .replace(/([A-Za-z])₇/g, "$1_7")
    .replace(/([A-Za-z])₈/g, "$1_8")
    .replace(/([A-Za-z])₉/g, "$1_9")
    .replace(/\b(sin|cos|tan|log|ln)\s*\(/gi, (_m, fn) => `\\${String(fn).toLowerCase()}(`)
    .trim();

  // Split merged equations like "v1 = ... v2 = ..." onto separate display lines.
  if (displayMode && /=/.test(out)) {
    const pieces = out
      .replace(/\s+/g, " ")
      .split(/\s+(?=[A-Za-z](?:[A-Za-z0-9_]*|_[0-9]+)\s*=)/)
      .map((s) => s.trim())
      .filter(Boolean);
    const assignmentPieces = pieces.filter((p) => /^[A-Za-z](?:[A-Za-z0-9_]*|_[0-9]+)\s*=/.test(p));
    if (assignmentPieces.length >= 2) {
      out = assignmentPieces.join(" \\\\ ");
    }
  }

  return out;
}

function renderKatex(latex: string, displayMode = true) {
  return katex.renderToString(normalizeLatexForRender(latex, displayMode), {
    throwOnError: false,
    displayMode,
    output: "html",
    strict: "ignore",
  });
}

function isMultiAssignmentLatex(latex: string) {
  const normalized = String(latex || "")
    .replace(/([A-Za-z])₀/g, "$1_0")
    .replace(/([A-Za-z])₁/g, "$1_1")
    .replace(/([A-Za-z])₂/g, "$1_2")
    .replace(/([A-Za-z])₃/g, "$1_3")
    .replace(/([A-Za-z])₄/g, "$1_4")
    .replace(/([A-Za-z])₅/g, "$1_5")
    .replace(/([A-Za-z])₆/g, "$1_6")
    .replace(/([A-Za-z])₇/g, "$1_7")
    .replace(/([A-Za-z])₈/g, "$1_8")
    .replace(/([A-Za-z])₉/g, "$1_9");
  const matches = normalized.match(/\b[A-Za-z](?:[A-Za-z0-9_]*|_[0-9]+)\s*=/g) || [];
  return matches.length >= 2;
}

function normalizeDisplayText(input: string) {
  let out = String(input || "")
    // Ensure token boundaries don't glue to surrounding words (e.g. [[EQ:id]]Find).
    .replace(/(\S)(\[\[(?:EQ|IMG|MATH):[\s\S]*?\]\])/g, "$1 $2")
    .replace(/(\[\[(?:EQ|IMG|MATH):[\s\S]*?\]\])(\S)/g, "$1 $2")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/푃/g, "P")
    .replace(/푉/g, "V")
    .replace(/푅/g, "R")
    .replace(/푡/g, "t")
    .replace(/푚/g, "m")
    .replace(/푙/g, "l")
    .replace(/퐹/g, "F")
    .replace(/휋/g, "π")
    .replace(/−/g, "-")
    .replace(/�/g, " ")
    .replace(/\b([A-Za-z])\1\b/g, "$1")
    .replace(/\(([A-Za-z])\1\)/g, "($1)")
    // Fix common OCR joins around equations/units.
    .replace(/([)\]}])([A-Za-z])/g, "$1 $2")
    .replace(/\b([A-Za-z])where\b/g, "$1 where")
    .replace(/\b([A-Za-z])Find\b/g, "$1 Find")
    // Preserve newlines; only collapse repeated horizontal spacing.
    .replace(/[ \t]{2,}/g, " ");

  out = injectHeuristicMathTokens(out);

  return out;
}

function injectHeuristicMathTokens(input: string) {
  const blocks = String(input || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/);
  const mapped = blocks.map((block) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return block;

    // Strict stacked fraction: exactly 4 short lines (or one compressed line sequence)
    if (lines.length === 4) {
      const m0 = lines[0].match(/^([A-Za-z])\s*=\s*$/);
      const m1 = lines[1].match(/^([A-Za-z])$/);
      const m2 = lines[2].match(/^([0-9])$/);
      const m3 = lines[3].match(/^([A-Za-z])$/);
      if (m0 && m1 && m2 && m3) {
        return `[[MATH:${m0[1]}=\\frac{${m1[1]}^${m2[1]}}{${m3[1]}}]]`;
      }
    }

    const compact = lines.join(" ").replace(/\s+/g, " ");
    const compactMath = compact
      .replace(/\s*=\s*/g, "=")
      .replace(/\s*\+\s*/g, "+")
      .replace(/\s*-\s*/g, "-")
      .replace(/\s*\*\s*/g, "")
      .replace(/\s+/g, " ");

    const inlineEq = compactMath.match(/\b([vVyYiIlL])\s*=\s*([A-Za-z0-9+\-^().\\{}_, ]{3,160})/);
    if (inlineEq) {
      const lhs = inlineEq[1];
      const rawRhs = inlineEq[2];
      const rhsWords = rawRhs.match(/[A-Za-z]{4,}/g) || [];
      const narrativeHits = rhsWords.filter((w) =>
        /^(the|then|number|characters|email|address|example|assuming|determine|approximate|value|values|state|year|birth|arrive|voltage|would)$/i.test(w)
      ).length;
      const looksNarrative = rhsWords.length >= 4 || narrativeHits >= 2;
      if (looksNarrative) return compact;

      const rhs = rawRhs
        // Recover common OCR-stacked exponents once newlines are flattened into spaces.
        // e.g. "t 3" -> "t^3", "(... ) 2" -> "(...)^2"
        .replace(/([A-Za-z])\s+(\d{1,2})\b/g, "$1^$2")
        .replace(/(\))\s+(\d{1,2})\b/g, "$1^$2")
        .replace(/\ble\(\s*([^)]+)\s*\)/gi, (_m, arg) => `\\log_{e}\\left(${String(arg).trim()}\\right)`)
        .replace(/\blog\s*e\s*\(\s*([^)]+)\s*\)/gi, (_m, arg) => `\\log_{e}\\left(${String(arg).trim()}\\right)`)
        .replace(/\blog_e\s*\(\s*([^)]+)\s*\)/gi, (_m, arg) => `\\log_{e}\\left(${String(arg).trim()}\\right)`)
        .replace(/\be\^\s*-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
        .replace(/\be\s*-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
        .replace(/\be-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
        .replace(/\bln\s*\(\s*e\s*\(/gi, "\\ln(e(")
        .replace(/\bsin\s*\(/gi, "\\sin(")
        .replace(/\bcos\s*\(/gi, "\\cos(")
        .replace(/\btan\s*\(/gi, "\\tan(")
        .replace(/\be\^\(\s*-/gi, "e^{-")
        .replace(/\)\s*\^/g, ")^")
        .trim();
      return `[[MATH:${lhs}=${rhs}]]`;
    }

    // Inline snippet replacements inside paragraph text.
    let replaced = compact.replace(
      /\bt\s*=\s*2\s*(?:\\pi|π)\s*m\s*2\s*l\s*F\b/gi,
      "[[MATH:t=2\\pi\\sqrt{\\frac{m^2 l}{F}}]]"
    );

    replaced = replaced.replace(
      /\b([A-Za-z])\s*=\s*([A-Za-z])\s+([0-9])\s+([A-Za-z])\b/g,
      (_m, lhs, numBase, exp, den) => `[[MATH:${lhs}=\\frac{${numBase}^${exp}}{${den}}]]`
    );

    return replaced;
  });
  return mapped.join("\n\n");
}

function linkify(text: string, keyPrefix: string) {
  text = normalizeDisplayText(text);
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(URL_RE.source, "g");

  while ((match = re.exec(text))) {
    const start = match.index;
    const raw = match[0];
    if (start > last) nodes.push(...linkifyTaskRefs(text.slice(last, start), `${keyPrefix}-t-${start}`));
    const clean = raw.replace(/[),.;]+$/g, "");
    const trailing = raw.slice(clean.length);
    nodes.push(
      <a
        key={`${keyPrefix}-u-${start}`}
        href={clean}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-dotted decoration-sky-400 underline-offset-2 break-all text-sky-700 hover:text-sky-800"
      >
        {clean}
      </a>
    );
    if (trailing) nodes.push(...linkifyTaskRefs(trailing, `${keyPrefix}-tt-${start}`));
    last = start + raw.length;
  }
  if (last < text.length) nodes.push(...linkifyTaskRefs(text.slice(last), `${keyPrefix}-tail`));
  return nodes;
}

function linkifyTaskRefs(text: string, keyPrefix: string) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(TASK_REF_RE.source, "g");
  while ((match = re.exec(text))) {
    const start = match.index;
    const full = match[1];
    const n = Number(match[2]);
    if (start > last) nodes.push(text.slice(last, start));
    if (Number.isFinite(n) && n > 0) {
      nodes.push(
        <a
          key={`${keyPrefix}-task-${start}`}
          href={`#task-card-${n}`}
          className="underline decoration-sky-400 underline-offset-2 text-sky-700 font-medium hover:text-sky-800"
        >
          {full}
        </a>
      );
    } else {
      nodes.push(full);
    }
    last = start + full.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function EquationFallback({
  eq,
  openPdfHref,
  canEditLatex,
  onSaveLatex,
  suggestedLatex,
}: {
  eq: Equation;
  openPdfHref?: string;
  canEditLatex?: boolean;
  onSaveLatex?: (equationId: string, latex: string) => Promise<void> | void;
  suggestedLatex?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(eq.latex || "");
  const [saving, setSaving] = useState(false);
  const [inputMode, setInputMode] = useState<"latex" | "word">("latex");
  const previewLatex = inputMode === "word" ? convertWordLinearToLatex(value) : value;

  return (
    <span className="relative inline-flex items-center gap-1 align-middle">
      <span className="rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-[10px] text-amber-900">
        equation needs review
      </span>
      {canEditLatex ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[10px] font-semibold text-amber-900 underline underline-offset-2"
        >
          Edit LaTeX
        </button>
      ) : null}
      {open ? (
        <span className="absolute left-0 top-[110%] z-20 min-w-[320px] max-w-[460px] rounded-md border border-zinc-300 bg-white p-2 text-xs text-zinc-700 shadow-lg">
          <span className="block text-[11px] text-zinc-500">Page {eq.pageNumber}</span>
          {openPdfHref ? (
            <a href={openPdfHref} target="_blank" rel="noreferrer" className="text-[11px] text-sky-700 underline">
              open source PDF
            </a>
          ) : null}
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={inputMode === "word" ? "Example: v=5e^-0.2t" : "Paste LaTeX"}
            className="mt-2 block w-full rounded border border-zinc-300 px-2 py-1 text-xs"
          />
          <span className="mt-2 flex items-center gap-1">
            <button
              type="button"
              disabled={saving}
              onClick={() => setInputMode("word")}
              className={
                "rounded border px-2 py-1 text-[11px] font-semibold disabled:opacity-60 " +
                (inputMode === "word"
                  ? "border-sky-300 bg-sky-50 text-sky-800"
                  : "border-zinc-300 bg-white text-zinc-700")
              }
            >
              Word input
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setInputMode("latex")}
              className={
                "rounded border px-2 py-1 text-[11px] font-semibold disabled:opacity-60 " +
                (inputMode === "latex"
                  ? "border-sky-300 bg-sky-50 text-sky-800"
                  : "border-zinc-300 bg-white text-zinc-700")
              }
            >
              LaTeX input
            </button>
          </span>
          {inputMode === "word" ? (
            <span className="mt-2 block rounded border border-zinc-200 bg-zinc-50 p-2 text-[11px] text-zinc-700">
              Converted LaTeX: <code>{previewLatex || "—"}</code>
            </span>
          ) : null}
          {suggestedLatex ? (
            <span className="mt-2 block rounded border border-sky-200 bg-sky-50 p-2 text-[11px] text-sky-900">
              Suggested: <code>{suggestedLatex}</code>
            </span>
          ) : null}
          <span className="mt-2 flex items-center gap-2">
            {suggestedLatex ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => setValue(suggestedLatex)}
                className="rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-800 disabled:opacity-60"
              >
                Auto-fill
              </button>
            ) : null}
            {suggestedLatex && onSaveLatex ? (
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onSaveLatex(eq.id, suggestedLatex);
                    setValue(suggestedLatex);
                    setOpen(false);
                  } finally {
                    setSaving(false);
                  }
                }}
                className="rounded border border-sky-300 bg-sky-100 px-2 py-1 text-[11px] font-semibold text-sky-900 disabled:opacity-60"
              >
                Auto-save guess
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving || !previewLatex.trim()}
              onClick={async () => {
                if (!onSaveLatex || !previewLatex.trim()) return;
                setSaving(true);
                try {
                  await onSaveLatex(eq.id, previewLatex.trim());
                  setValue(previewLatex.trim());
                  setOpen(false);
                } finally {
                  setSaving(false);
                }
              }}
              className="rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-800 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] text-zinc-700"
            >
              Close
            </button>
          </span>
        </span>
      ) : null}
    </span>
  );
}

export default function InlineEquationText({
  text,
  equationsById = {},
  openPdfHref,
  canEditLatex,
  onSaveLatex,
}: Props) {
  const parts = useMemo(() => normalizeDisplayText(String(text || "")).split(TOKEN_RE), [text]);
  const out: React.ReactNode[] = [];

  const normalizeSuggestedLatex = (raw: string) => {
    return String(raw || "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/−/g, "-")
      .replace(/\blog_e\s*\(/gi, "\\log_{e}(")
      .replace(/\be\^\s*-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
      .replace(/\be\s*-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
      .replace(/\be-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
      .replace(/\b(sin|cos|tan)\s*\(/gi, (_m, fn) => `\\${String(fn).toLowerCase()}(`)
      .replace(/\s+/g, " ")
      .trim();
  };

  const guessLatexFromContext = (index: number) => {
    const prev = String(parts[index - 1] || "");
    const next = String(parts[index + 1] || "");
    const context = `${prev}\n${next}`.replace(/\r/g, "\n");
    const lines = context
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (!/^[A-Za-z][A-Za-z0-9_]*\s*=/.test(line)) continue;
      if (line.length > 160) continue;
      return normalizeSuggestedLatex(line);
    }
    return "";
  };

  const hasInlineEquationContext = (index: number) => {
    const prev = String(parts[index - 1] || "");
    const next = String(parts[index + 1] || "");
    const prevTrimEnd = prev.replace(/\s+$/g, "");
    const nextTrimStart = next.replace(/^\s+/g, "");
    const prevEndsWithLineBreak = /\n\s*$/.test(prev);
    const nextStartsWithLineBreak = /^\s*\n/.test(next);
    if (prevEndsWithLineBreak || nextStartsWithLineBreak) return false;
    // Treat as inline when token is embedded in a sentence/phrase context.
    return !!(prevTrimEnd || nextTrimStart);
  };

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] || "";
    const eqTokenId = part.match(/^\[\[EQ:([^\]]+)\]\]$/)?.[1];
    const imgTokenId = part.match(/^\[\[IMG:([^\]]+)\]\]$/)?.[1];
    if (!eqTokenId && !imgTokenId) {
      const chunks = part.split(HEURISTIC_MATH_TOKEN_RE);
      for (let c = 0; c < chunks.length; c += 1) {
        const chunk = chunks[c] || "";
        const math = chunk.match(/^\[\[MATH:([\s\S]*?)\]\]$/)?.[1];
        if (math) {
          out.push(
            <span
              key={`hm-${i}-${c}`}
              className="inline-block max-w-full overflow-x-auto whitespace-nowrap align-middle py-0.5 mx-1"
              dangerouslySetInnerHTML={{ __html: renderKatex(math, false) }}
            />
          );
        } else {
          out.push(...linkify(chunk, `txt-${i}-${c}`));
        }
      }
      continue;
    }

    if (imgTokenId) {
      out.push(
        <span key={`img-${imgTokenId}`} className="my-1 block rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-900">
          diagram reference from PDF image
          {openPdfHref ? (
            <>
              {" "}
              <a href={openPdfHref} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                open source PDF
              </a>
            </>
          ) : null}
        </span>
      );
      continue;
    }

    const eq = equationsById[eqTokenId];
    const inlineContext = hasInlineEquationContext(i);
    if (!eq) {
      out.push(
        <span key={`missing-${eqTokenId}`} className="rounded border border-amber-300 bg-amber-50 px-1 text-[10px] text-amber-900">
          equation missing
        </span>
      );
      continue;
    }

    if (eq.latex && !eq.needsReview) {
      const forceDisplay = isMultiAssignmentLatex(eq.latex);
      const displayMode = forceDisplay || !inlineContext;
      out.push(
        <span
          key={`eq-${eq.id}`}
          className={
            (displayMode
              ? "block max-w-full overflow-x-auto whitespace-nowrap align-middle py-1"
              : "inline-block max-w-full overflow-x-auto whitespace-nowrap align-middle py-0.5 mx-1")
          }
          dangerouslySetInnerHTML={{ __html: renderKatex(eq.latex, displayMode) }}
        />
      );
      continue;
    }

    out.push(
      <EquationFallback
        key={`fallback-${eq.id}`}
        eq={eq}
        openPdfHref={openPdfHref}
        canEditLatex={canEditLatex}
        onSaveLatex={onSaveLatex}
        suggestedLatex={guessLatexFromContext(i) || undefined}
      />
    );
  }

  return <>{out}</>;
}
