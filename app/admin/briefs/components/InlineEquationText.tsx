"use client";

import { useMemo, useState } from "react";
import katex from "katex";

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

function renderKatex(latex: string) {
  return katex.renderToString(latex, {
    throwOnError: false,
    displayMode: true,
    output: "html",
    strict: "ignore",
  });
}

function normalizeDisplayText(input: string) {
  let out = String(input || "")
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
    .replace(/\(([A-Za-z])\1\)/g, "($1)");

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

    const inlineEq = compactMath.match(/\b([vyiIlL])\s*=\s*([A-Za-z0-9+\-^().\\{}_, ]{3,160})/);
    if (inlineEq) {
      const lhs = inlineEq[1];
      const rhs = inlineEq[2]
        .replace(/\ble\(\s*([^)]+)\s*\)/gi, (_m, arg) => `\\log_{e}\\left(${String(arg).trim()}\\right)`)
        .replace(/\blog\s*e\s*\(\s*([^)]+)\s*\)/gi, (_m, arg) => `\\log_{e}\\left(${String(arg).trim()}\\right)`)
        .replace(/\blog_e\s*\(\s*([^)]+)\s*\)/gi, (_m, arg) => `\\log_{e}\\left(${String(arg).trim()}\\right)`)
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
    if (start > last) nodes.push(text.slice(last, start));
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
    if (trailing) nodes.push(trailing);
    last = start + raw.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function EquationFallback({
  eq,
  openPdfHref,
  canEditLatex,
  onSaveLatex,
}: {
  eq: Equation;
  openPdfHref?: string;
  canEditLatex?: boolean;
  onSaveLatex?: (equationId: string, latex: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(eq.latex || "");
  const [saving, setSaving] = useState(false);

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
            placeholder="Paste LaTeX"
            className="mt-2 block w-full rounded border border-zinc-300 px-2 py-1 text-xs"
          />
          <span className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={saving || !value.trim()}
              onClick={async () => {
                if (!onSaveLatex || !value.trim()) return;
                setSaving(true);
                try {
                  await onSaveLatex(eq.id, value.trim());
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
              className="block align-middle py-1"
              dangerouslySetInnerHTML={{ __html: renderKatex(math) }}
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
    if (!eq) {
      out.push(
        <span key={`missing-${eqTokenId}`} className="rounded border border-amber-300 bg-amber-50 px-1 text-[10px] text-amber-900">
          equation missing
        </span>
      );
      continue;
    }

    if (eq.latex && !eq.needsReview) {
      out.push(
        <span
          key={`eq-${eq.id}`}
          className="block align-middle py-1"
          dangerouslySetInnerHTML={{ __html: renderKatex(eq.latex) }}
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
      />
    );
  }

  return <span>{out}</span>;
}
