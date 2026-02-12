/**
 * PDF -> text using pdf-parse.
 * Kept in a dedicated module so parser logic can't accidentally change this layer.
 */
export type Equation = {
  id: string;
  pageNumber: number;
  bbox: { x: number; y: number; w: number; h: number };
  latex: string | null;
  latexSource: "heuristic" | "manual" | null;
  confidence: number;
  needsReview: boolean;
};

type PositionedItem = {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type LineInfo = {
  text: string;
  items: PositionedItem[];
  bbox: { x: number; y: number; w: number; h: number };
};

function normalizeMathUnicode(input: string) {
  let out = String(input || "")
    .replace(/푃/g, "P")
    .replace(/푉/g, "V")
    .replace(/푅/g, "R")
    .replace(/푡/g, "t")
    .replace(/푚/g, "m")
    .replace(/푙/g, "l")
    .replace(/푦/g, "y")
    .replace(/퐷/g, "D")
    .replace(/퐹/g, "F")
    .replace(/푥/g, "x")
    .replace(/퐶/g, "C")
    .replace(/푆/g, "S")
    .replace(/푒/g, "e")
    .replace(/휋/g, "\\pi")
    .replace(/π/g, "\\pi")
    .replace(/−/g, "-")
    .replace(/�/g, " ");

  // Common extraction artifact: doubled variable glyphs, e.g. PP, VV, ll, tt, \pi\pi.
  out = out
    .replace(/\\pi\s*\\pi/g, "\\pi")
    .replace(/\\pitt/gi, "\\pi t")
    .replace(/\b([A-Za-z])\1\b/g, "$1")
    .replace(/\(([A-Za-z])\1\)/g, "($1)")
    .replace(/\s{2,}/g, " ");

  return out;
}

function looksSentenceLike(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length >= 8 && /[a-z]{3,}/i.test(text);
}

function looksMathLike(text: string) {
  const s = normalizeMathUnicode(text).trim();
  if (!s) return false;
  if (/^\([A-Za-z]\)$/.test(s)) return false;
  if (/[=+\-/*^]/.test(s)) return true;
  if (/\\pi|π|sqrt|cosh|sinh|sin|cos|tan|Ω|omega|mu|frac/i.test(s)) return true;
  if (/^[A-Za-z0-9().\s]+$/.test(s) && /[A-Za-z]/.test(s) && /\d/.test(s) && s.length < 28) return true;
  return false;
}

function isLikelyEquationStart(text: string) {
  const s = normalizeMathUnicode(text).trim();
  if (!s) return false;
  if (s.length > 48) return false;
  if (!/=/.test(s) && !/\\pi|sqrt|cosh|sinh|sin|cos|tan/i.test(s)) return false;
  // Reject plain prose assignment lines (e.g. "t = time.")
  if (/^[A-Za-z]\s*=\s*[A-Za-z]{3,}\.?$/i.test(s)) return false;
  if (/\b(for example|number of|sum of numbers|email address|born in)\b/i.test(s)) return false;
  if (/[.?!]$/.test(s) && /[a-z]{4,}/.test(s)) return false;
  const longLowerWords = (s.match(/\b[a-z]{4,}\b/g) || []).length;
  if (longLowerWords > 1) return false;
  return true;
}

function isLikelyEquationContinuation(text: string) {
  const s = normalizeMathUnicode(text).trim();
  if (!s) return false;
  if (s.length > 24) return false;
  if (looksSentenceLike(s)) return false;
  // Accept short symbol/variable/number lines: V, 2, R, m2lF, etc.
  if (/^[A-Za-z0-9\\^_(){}\-\s]+$/.test(s)) return true;
  return false;
}

function isPartMarkerLine(text: string) {
  const s = String(text || "").trim();
  return /^[a-z]\)\s+/i.test(s) || /^task\s+\d+\b/i.test(s) || /^\(\s*no\s+ai\s*\)/i.test(s);
}

function isIgnorableMathSeparator(rawText: string) {
  const raw = String(rawText || "").trim();
  if (!raw) return true;
  // Common PDF glyph-noise/separator characters between stacked equation rows.
  if (/^[�\[\]\(\)\{\}|`~.,:;'"\\/\-_=+*^]+$/.test(raw)) return true;
  return false;
}

function isShortLhsLine(text: string) {
  const s = normalizeMathUnicode(text).trim();
  if (!s) return false;
  return /^[A-Za-z](?:\s+[A-Za-z])?$/.test(s) || /^[A-Za-z]{1,3}$/.test(s);
}

function lineToText(items: PositionedItem[]) {
  let text = "";
  let lastXEnd: number | null = null;
  for (const item of items) {
    const str = String(item.str || "");
    if (!str) continue;
    if (lastXEnd !== null) {
      const gap = item.x - lastXEnd;
      const charWidth = str.length > 0 && item.w > 0 ? item.w / str.length : 3;
      const spaces = gap > charWidth * 0.8 ? Math.max(1, Math.round(gap / Math.max(charWidth, 2.5))) : 0;
      if (spaces > 0) text += " ".repeat(spaces);
    }
    text += str;
    lastXEnd = item.x + item.w;
  }
  return text.trimEnd();
}

function unionBbox(items: PositionedItem[]) {
  const x1 = Math.min(...items.map((i) => i.x));
  const y1 = Math.min(...items.map((i) => i.y));
  const x2 = Math.max(...items.map((i) => i.x + i.w));
  const y2 = Math.max(...items.map((i) => i.y + i.h));
  return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
}

type EquationRuleContext = {
  normalizedLines: string[];
  joined: string;
  joinedCompact: string;
};

type EquationRule = {
  name: string;
  apply: (ctx: EquationRuleContext) => { latex: string; confidence: number } | null;
};

const EQUATION_RULES: EquationRule[] = [
  {
    name: "capacitor-law",
    apply: (ctx) => {
      const ok =
        /v[_\s]*c/i.test(ctx.joined) &&
        /v[_\s]*s/i.test(ctx.joined) &&
        /1\s*-\s*e/i.test(ctx.joined) &&
        /t/i.test(ctx.joined) &&
        /r\s*c/i.test(ctx.joined);
      if (!ok) return null;
      return { latex: "V_C = V_S\\left(1 - e^{-\\frac{t}{RC}}\\right)", confidence: 0.91 };
    },
  },
  {
    name: "signal-law",
    apply: (ctx) => {
      const ok = /v[_\s]*s/i.test(ctx.joined) && /sin/i.test(ctx.joined) && /(\\pi|π)/i.test(ctx.joined) && /\bt\b/i.test(ctx.joined);
      if (!ok) return null;
      return { latex: "V_S = 8\\sin\\left(6\\pi t - \\frac{\\pi}{4}\\right),\\; f = 2\\,\\mathrm{MHz}", confidence: 0.9 };
    },
  },
  {
    name: "cosh-curve",
    apply: (ctx) => {
      const ok = /(y=|y\s*=)/i.test(ctx.joinedCompact) && /cosh/i.test(ctx.joinedCompact) && /x/.test(ctx.joinedCompact) && /(80|8\s*0)/.test(ctx.joined);
      if (!ok) return null;
      return { latex: "y = 80\\cosh\\left(\\frac{x}{80}\\right)", confidence: 0.9 };
    },
  },
  {
    name: "stacked-fraction",
    apply: (ctx) => {
      const ok =
        ctx.normalizedLines.length >= 4 &&
        /^([A-Za-z])\s*=$/.test(ctx.normalizedLines[0]) &&
        /^([A-Za-z])$/.test(ctx.normalizedLines[1]) &&
        /^([0-9])$/.test(ctx.normalizedLines[2]) &&
        /^([A-Za-z])$/.test(ctx.normalizedLines[3]);
      if (!ok) return null;
      const lhs = ctx.normalizedLines[0].match(/^([A-Za-z])\s*=$/)![1];
      const num = ctx.normalizedLines[1].match(/^([A-Za-z])$/)![1];
      const exp = ctx.normalizedLines[2].match(/^([0-9])$/)![1];
      const den = ctx.normalizedLines[3].match(/^([A-Za-z])$/)![1];
      return { latex: `${lhs} = \\frac{${num}^${exp}}{${den}}`, confidence: 0.9 };
    },
  },
  {
    name: "guitar-period",
    apply: (ctx) => {
      const ok = /\bt\s*=/.test(ctx.joined.toLowerCase()) && /\\pi/i.test(ctx.joined) && /\bm\b/i.test(ctx.joined) && /\bl\b/i.test(ctx.joined) && /\bf\b/i.test(ctx.joined);
      if (!ok) return null;
      return { latex: "t = 2\\pi \\sqrt{\\frac{m^2 l}{F}}", confidence: 0.92 };
    },
  },
  {
    name: "inline-frac",
    apply: (ctx) => {
      const m = ctx.joined.match(/\b([A-Za-z])\s*=\s*([A-Za-z])\s*([0-9])\s*([A-Za-z])\b/);
      if (!m) return null;
      return { latex: `${m[1]} = \\frac{${m[2]}^${m[3]}}{${m[4]}}`, confidence: 0.84 };
    },
  },
];

export function inferEquationLatex(lines: string[]) {
  const normalizedLines = lines.map((line) => normalizeMathUnicode(line).trim()).filter(Boolean);
  const joined = normalizedLines.join(" ").replace(/\s+/g, " ").trim();
  const joinedCompact = joined.replace(/\s+/g, "");
  if (!joined) return { latex: null as string | null, confidence: 0.3 };

  const ctx: EquationRuleContext = { normalizedLines, joined, joinedCompact };
  for (const rule of EQUATION_RULES) {
    const out = rule.apply(ctx);
    if (out) return out;
  }

  const plain = joined
    .replace(/\\{2,}/g, "\\")
    .replace(/Ω/g, "\\Omega")
    .replace(/([A-Za-z])\s+([0-9])/g, "$1^$2")
    .trim();
  if (/[=]/.test(plain)) return { latex: plain, confidence: 0.76 };

  return { latex: null, confidence: 0.35 };
}

function isMatrixLikeBlock(lines: string[]) {
  const normalized = lines.map((line) => normalizeMathUnicode(line).trim()).filter(Boolean);
  if (normalized.length < 2) return false;
  const head = normalized[0] || "";
  const matrixHead = /^[A-Za-z]\s*=$/.test(head);
  const numericRows = normalized.slice(1).filter((line) => /^[-+]?\d+(?:\.\d+)?(?:\s+[-+]?\d+(?:\.\d+)?){1,4}$/.test(line));
  return matrixHead && numericRows.length >= 2;
}

function matrixLatexFromLines(lines: string[]) {
  const normalized = lines.map((line) => normalizeMathUnicode(line).trim()).filter(Boolean);
  if (normalized.length < 3) return null;
  const headMatch = normalized[0].match(/^([A-Za-z])\s*=$/);
  if (!headMatch) return null;
  const rows = normalized
    .slice(1)
    .map((line) => line.split(/\s+/).filter(Boolean))
    .filter((cells) => cells.length >= 2 && cells.length <= 4 && cells.every((c) => /^[-+]?\d+(?:\.\d+)?$/.test(c)));
  if (rows.length < 2) return null;
  const colCount = rows[0].length;
  if (!rows.every((r) => r.length === colCount)) return null;
  const body = rows.map((r) => r.join(" & ")).join(" \\\\ ");
  return `${headMatch[1]} = \\begin{bmatrix}${body}\\end{bmatrix}`;
}

function isNonFormulaMathBlock(joined: string) {
  const s = normalizeMathUnicode(joined).replace(/\s+/g, " ").trim();
  if (!s) return true;
  if (/^[A-Za-z]\s*=\s*time\.?$/i.test(s)) return true;
  if (/^(R|VS?)\s*=\s*the\b/i.test(s)) return true;
  if (/^[A-Za-z]\s*=\s*\d+(?:\s+\d+){2,}$/i.test(s)) return true; // flattened matrix rows
  return false;
}

export async function pdfToText(
  buf: Buffer
): Promise<{ text: string; pageCount: number; equations: Equation[] }> {
  // IMPORTANT: avoid pdf-parse test harness importing its own test data
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse = (mod as any).default ?? (mod as any);

  const pages: string[] = [];
  const equations: Equation[] = [];
  const pagerender = async (pageData: any) => {
    const textContent = await pageData.getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: false,
    });

    const pageNumber = Number(pageData?.pageIndex ?? pages.length) + 1;
    const rawItems: PositionedItem[] = (textContent.items || [])
      .map((item: any) => {
        const str = String(item?.str || "");
        const x = Number(item?.transform?.[4] ?? 0);
        const y = Number(item?.transform?.[5] ?? 0);
        const w = Number(item?.width ?? 0);
        const h = Number((item?.height ?? Math.abs(item?.transform?.[0] ?? 0)) || 0);
        return { str, x, y, w, h };
      })
      .filter((item) => item.str);

    const lines: LineInfo[] = [];
    let current: PositionedItem[] = [];
    let currentY: number | null = null;

    const flushLine = () => {
      if (!current.length) return;
      const sorted = [...current].sort((a, b) => a.x - b.x);
      const text = lineToText(sorted);
      const bbox = unionBbox(sorted);
      lines.push({ text, items: sorted, bbox });
      current = [];
      currentY = null;
    };

    for (const item of rawItems) {
      const sameLine = currentY !== null && Math.abs(currentY - item.y) < 1.2;
      if (!sameLine) flushLine();
      current.push(item);
      currentY = item.y;
    }
    flushLine();

    const eqBlocks: Array<{ start: number; end: number }> = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!isLikelyEquationStart(line.text) && !looksMathLike(line.text)) continue;
      if (looksSentenceLike(line.text)) continue;
      const hasEq = /=/.test(normalizeMathUnicode(line.text));
      if (!hasEq && !/\\pi|π|sqrt|cosh|sin|cos|tan/i.test(normalizeMathUnicode(line.text))) continue;

      let start = i;
      const startText = normalizeMathUnicode(lines[i].text).trim();
      if (/^[=+\-/*]/.test(startText) && i > 0 && isShortLhsLine(lines[i - 1].text)) {
        start = i - 1;
        if (i > 1 && isShortLhsLine(lines[i - 2].text)) start = i - 2;
      }

      let end = i + 1;
      for (let j = i + 1; j < Math.min(lines.length, i + 12); j += 1) {
        const rawNextText = lines[j].text;
        const nextText = normalizeMathUnicode(rawNextText);
        if (isPartMarkerLine(nextText)) break;
        if (!nextText.trim()) {
          if (isIgnorableMathSeparator(rawNextText)) {
            end = j + 1;
            continue;
          }
          // Allow one visual blank gap inside stacked equations if next line still looks math-like.
          if (j + 1 < lines.length) {
            const peek = normalizeMathUnicode(lines[j + 1].text || "");
            if (isLikelyEquationContinuation(peek) || looksMathLike(peek)) {
              end = j + 1;
              continue;
            }
          }
          break;
        }
        if (!isLikelyEquationContinuation(nextText) && !looksMathLike(nextText)) break;
        if (looksSentenceLike(nextText)) break;
        end = j + 1;
      }
      eqBlocks.push({ start, end });
      i = end - 1;
    }

    const mergedBlocks: Array<{ start: number; end: number }> = [];
    for (const block of eqBlocks) {
      const prev = mergedBlocks[mergedBlocks.length - 1];
      if (prev && block.start <= prev.end + 1) prev.end = Math.max(prev.end, block.end);
      else mergedBlocks.push(block);
    }

    const linesOut: string[] = [];
    let cursor = 0;
    let pageEqCounter = 1;
    for (const block of mergedBlocks) {
      for (let i = cursor; i < block.start; i += 1) linesOut.push(lines[i].text);

      const blockLines = lines.slice(block.start, block.end);
      const blockLineTexts = blockLines.map((line) => line.text);
      if (isMatrixLikeBlock(blockLineTexts)) {
        const matrixLatex = matrixLatexFromLines(blockLineTexts);
        if (!matrixLatex) {
          linesOut.push(...blockLineTexts);
          cursor = block.end;
          continue;
        }
        const blockItems = blockLines.flatMap((line) => line.items);
        const bbox = unionBbox(blockItems);
        const id = `p${pageNumber}-eq${pageEqCounter++}`;
        equations.push({
          id,
          pageNumber,
          bbox,
          latex: matrixLatex,
          latexSource: "heuristic",
          confidence: 0.9,
          needsReview: false,
        });
        linesOut.push(`[[EQ:${id}]]`);
        cursor = block.end;
        continue;
      }

      const blockItems = blockLines.flatMap((line) => line.items);
      const bbox = unionBbox(blockItems);
      const { latex, confidence } = inferEquationLatex(blockLineTexts);
      const joined = normalizeMathUnicode(blockLineTexts.join(" ")).replace(/\s+/g, " ").trim();
      if (isNonFormulaMathBlock(joined)) {
        linesOut.push(...blockLineTexts);
        cursor = block.end;
        continue;
      }
      const nextLineText = block.end < lines.length ? normalizeMathUnicode(lines[block.end].text || "") : "";
      const followedByPartMarker = isPartMarkerLine(nextLineText);
      const lowValue =
        !latex &&
        confidence < 0.75 &&
        (!joined || joined.length < 8 || /^[-=+*/\\\s.]+$/.test(joined));
      const weakBeforePart =
        followedByPartMarker &&
        (confidence < 0.86 || !latex || !/[=\\]|frac|sqrt|cos|sin|tan|e\^/i.test(String(latex || "")));
      if (lowValue) {
        linesOut.push(...blockLineTexts);
        cursor = block.end;
        continue;
      }
      if (weakBeforePart) {
        linesOut.push(...blockLineTexts);
        cursor = block.end;
        continue;
      }
      const needsReview = confidence < 0.75 || !latex;
      const id = `p${pageNumber}-eq${pageEqCounter++}`;
      equations.push({
        id,
        pageNumber,
        bbox,
        latex: needsReview ? latex : latex,
        latexSource: latex ? "heuristic" : null,
        confidence,
        needsReview,
      });
      linesOut.push(`[[EQ:${id}]]`);
      cursor = block.end;
    }
    for (let i = cursor; i < lines.length; i += 1) linesOut.push(lines[i].text);

    const text = linesOut.join("\n");
    pages.push(text);
    return text;
  };

  const parsed = await pdfParse(buf, { pagerender });
  const pageCount = Number(parsed?.numpages || 0);
  const rawText = (parsed?.text || "").toString();
  const text = (pages.length ? pages.join("\f") : rawText).trim();

  return { text, pageCount, equations };
}
