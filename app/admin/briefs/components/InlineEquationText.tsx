"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { type ReactNode } from "react";

const URL_REGEX = /(https?:\/\/[^\s)]+)/g;

const UNICODE_MATH_MAP: Record<string, string> = {
  "푃": "P",
  "푉": "V",
  "푅": "R",
  "푡": "t",
  "푦": "y",
  "퐷": "D",
  "푙": "l",
  "휋": "\\pi",
};

function normalizeMathUnicode(input: string) {
  let out = String(input || "");
  for (const [from, to] of Object.entries(UNICODE_MATH_MAP)) out = out.split(from).join(to);
  return out;
}

function normalizeMathEscapes(input: string) {
  return String(input || "")
    .replace(/\\\\([A-Za-z]+)/g, "\\$1")
    .replace(/\\mu([A-Za-z])/g, "\\mu \\\\mathrm{$1}")
    .replace(/\b(cosh|sinh|tanh|sin|cos|tan)\b/g, "\\$1");
}

function normalizeStackedEquationPatterns(input: string) {
  let out = String(input || "");

  // P = V 2 R -> P = \frac{V^2}{R}
  out = out.replace(/\b([A-Za-z])\s*=\s*([A-Za-z])\s+([0-9])\s+([A-Za-z])\b/g, "$1 = \\\\frac{$2^{$3}}{$4}");

  // Handle explicit newline stacked extraction: X =\nY\n2\nZ
  out = out.replace(
    /\b([A-Za-z])\s*=\s*\n\s*([A-Za-z])\s*\n\s*([0-9])\s*\n\s*([A-Za-z])\b/g,
    "$1 = \\\\frac{$2^{$3}}{$4}"
  );

  return out;
}

function preprocess(input: string) {
  return normalizeMathEscapes(normalizeStackedEquationPatterns(normalizeMathUnicode(input)));
}

function splitMathSegments(input: string) {
  const text = preprocess(input);
  const re =
    /(\\frac\{[^{}]+\}\{[^{}]+\}|[A-Za-z]\s*=\s*[A-Za-z0-9\\{}_^().+\-/*\s]{1,80}|[0-9A-Za-z]+\s*\\(?:pi|Omega|omega|mu|alpha|beta|gamma|delta|theta|lambda)\b)/g;
  const segments: Array<{ type: "text" | "math"; value: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text))) {
    const start = m.index;
    const value = String(m[0] || "").trim();
    if (start > last) segments.push({ type: "text", value: text.slice(last, start) });

    const mathLike = /\\[A-Za-z]+|=|\^|\/|\\frac\{/.test(value);
    segments.push({ type: mathLike ? "math" : "text", value });
    last = start + m[0].length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments.length ? segments : [{ type: "text", value: text }];
}

function linkifyText(input: string, keyPrefix: string): ReactNode[] {
  const text = String(input || "");
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  const regex = new RegExp(URL_REGEX.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    const start = match.index;
    const url = match[0];
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));
    const cleaned = url.replace(/[),.;]+$/g, "");
    const trailing = url.slice(cleaned.length);
    nodes.push(
      <a
        key={`${keyPrefix}-url-${start}`}
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

function renderMath(expr: string, key: string) {
  const input = expr.replace(/\s+/g, " ").trim();
  try {
    const html = katex.renderToString(input, { throwOnError: true, displayMode: false });
    return <span key={key} className="inline-block align-middle" dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    return (
      <span key={key} className="inline align-middle">
        <span>{input}</span>
        <span className="ml-1 rounded border border-amber-300 bg-amber-50 px-1 text-[10px] text-amber-900">math?</span>
      </span>
    );
  }
}

export default function InlineEquationText({ text, keyPrefix = "inline-eq" }: { text: string; keyPrefix?: string }) {
  const segments = splitMathSegments(String(text || ""));
  const nodes: ReactNode[] = [];

  segments.forEach((seg, idx) => {
    if (seg.type === "math") {
      nodes.push(renderMath(seg.value, `${keyPrefix}-math-${idx}`));
    } else {
      nodes.push(...linkifyText(seg.value, `${keyPrefix}-txt-${idx}`));
    }
  });

  return <span>{nodes}</span>;
}

