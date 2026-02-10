"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Pill } from "./ui";
import { detectTableBlocks } from "@/lib/extraction/render/tableBlocks";
import { parseParts } from "@/lib/extraction/render/parseParts";

type TaskConfidence = "CLEAN" | "HEURISTIC" | "OVERRIDDEN";

type TaskCardProps = {
  task: any;
  extractedTask?: any | null;
  overrideApplied?: boolean;
  defaultExpanded?: boolean;
  forcedExpanded?: boolean;
};

function confidenceTone(confidence: TaskConfidence) {
  if (confidence === "OVERRIDDEN") return "bg-rose-50 text-rose-800 ring-1 ring-rose-200";
  if (confidence === "HEURISTIC") return "bg-amber-50 text-amber-900 ring-1 ring-amber-200";
  return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
}

function normalizeText(text: string) {
  return (text || "").replace(/\r\n/g, "\n").replace(/\t/g, " ").replace(/\r/g, "\n").trim();
}

function cleanEncodingNoise(text: string) {
  return (text || "").replace(/[\uFFFD\u0000-\u001F]/g, (match) => (match === "\n" ? "\n" : "�"));
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
  const normalized = normalizeText(cleanEncodingNoise(text));
  if (!normalized) return "(empty)";
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const previewLines = lines.slice(0, 2).join(" ");
  const compact = previewLines.replace(/\s+/g, " ");
  return compact.length > 180 ? compact.slice(0, 180).trim() + "…" : compact;
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
    { style: "alpha", regex: /^([a-z])[\.)]\s+(.*)$/i },
    { style: "roman", regex: /^([ivxlcdm]+)[\.)]\s+(.*)$/i },
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


function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function tableBlockToHtml(headers: string[], rows: string[][]) {
  const thead = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
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

export function TaskCard({ task, extractedTask, overrideApplied, defaultExpanded, forcedExpanded }: TaskCardProps) {
  const [expandedLocal, setExpandedLocal] = useState(!!defaultExpanded);
  const [showDiff, setShowDiff] = useState(false);
  const [showRepeated, setShowRepeated] = useState(false);
  const [showWarningDetails, setShowWarningDetails] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [tableViewModes, setTableViewModes] = useState<Record<number, "rendered" | "html" | "raw">>({});
  const [copyHtmlStatus, setCopyHtmlStatus] = useState<Record<number, "idle" | "copied" | "failed">>({});


  const expanded = typeof forcedExpanded === "boolean" ? forcedExpanded : expandedLocal;

  const label = task?.label || (task?.n ? `Task ${task.n}` : "Task");
  const title = deriveTitle(task);
  const criteria = getCriteria(task);
  const preview = useMemo(() => buildPreview(task?.text || ""), [task?.text]);

  const contextLines = useMemo(() => {
    const text = normalizeText(task?.text || "");
    const lines = text.split("\n").map((line) => line.trim());
    const deduped = new Set<string>();
    lines.forEach((line) => {
      if (/^Further to your discussion\b/i.test(line)) deduped.add(line);
    });
    return Array.from(deduped);
  }, [task?.text]);

  const textWithoutContext = useMemo(() => {
    if (!contextLines.length) return task?.text || "";
    return String(task?.text || "")
      .split("\n")
      .filter((line: string) => !contextLines.includes(line.trim()))
      .join("\n");
  }, [contextLines, task?.text]);

  const blocks = useMemo(() => parseBlocks(textWithoutContext), [textWithoutContext]);
  const totalWords = useMemo(() => wordCount(task?.text || ""), [task?.text]);
  const pages = Array.isArray(task?.pages) ? task.pages.filter(Boolean) : [];
  const aias = task?.aias ? String(task.aias) : "";
  const parsedParts = useMemo(() => parseParts(task?.text || "", task?.parts), [task?.parts, task?.text]);
  const tableBlocks = useMemo(() => detectTableBlocks(task), [task]);

  const duplicateInfo = useMemo(() => {
    if (!blocks.length) return { duplicates: new Set<number>(), hiddenCount: 0 };
    const keyFor = (block: TextBlock) => {
      const raw = block.type === "ol" || block.type === "ul" ? block.items.join(" ") : block.text;
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

  const warningItems: string[] = Array.isArray(task?.warnings) ? task.warnings.map((w: unknown) => String(w)) : [];

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill cls="bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200">{label}</Pill>
            <Pill cls={confidenceTone(confidence)}>{confidence === "OVERRIDDEN" ? "Overridden" : confidence === "HEURISTIC" ? "Warnings" : "Clean"}</Pill>
            <Pill cls="bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200">{totalWords} words</Pill>
            {warningItems.length ? <Pill cls="bg-amber-50 text-amber-900 ring-1 ring-amber-200">Warnings</Pill> : null}
            {hasDuplicates ? <Pill cls="bg-amber-50 text-amber-900 ring-1 ring-amber-200">Duplicate suspected</Pill> : null}
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
            onClick={() => setExpandedLocal((prev) => !prev)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {warningItems.length ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowWarningDetails((prev) => !prev)}
            className="text-xs font-semibold text-amber-900 underline underline-offset-2"
          >
            {showWarningDetails ? "Hide warnings" : `Show warnings (${warningItems.length})`}
          </button>
          {showWarningDetails ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">
              {warningItems.map((w, i) => (
                <li key={`${w}-${i}`}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {!expanded ? (
        <div className="mt-3 text-sm text-zinc-700 line-clamp-2">{preview}</div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
            {contextLines.length ? (
              <div className="mb-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500">
                <div className="font-semibold text-zinc-600">Context line</div>
                <div className="mt-1">{contextLines[0]}</div>
              </div>
            ) : null}

            {parsedParts.length ? (
              <div className="mb-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Question parts</div>
                <ol className="list-[lower-alpha] space-y-2 pl-6">
                  {parsedParts.map((part) => (
                    <li key={part.key}>
                      <div>{renderInlineText(part.text)}</div>
                      {part.children?.length ? (
                        <ol className="mt-1 list-[lower-roman] space-y-1 pl-6">
                          {part.children.map((child) => (
                            <li key={child.key}>{renderInlineText(child.text)}</li>
                          ))}
                        </ol>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {tableBlocks.length ? (
              <div className="mb-4 space-y-3">
                {tableBlocks.map((tableBlock, tableIndex) => {
                  const tableMode = tableViewModes[tableIndex] || "rendered";
                  const html =
                    tableBlock.type === "table"
                      ? tableBlockToHtml(tableBlock.headers, tableBlock.rows)
                      : `<pre>${escapeHtml(tableBlock.text)}</pre>`;
                  const copyState = copyHtmlStatus[tableIndex] || "idle";

                  return (
                    <div key={`table-wrap-${tableIndex}`} className="space-y-2 rounded-lg border border-zinc-300 bg-white p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setTableViewModes((prev) => ({ ...prev, [tableIndex]: "rendered" }))}
                          className={"rounded-md px-2 py-1 text-xs font-medium " + (tableMode === "rendered" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700")}
                        >
                          Rendered
                        </button>
                        <button
                          type="button"
                          onClick={() => setTableViewModes((prev) => ({ ...prev, [tableIndex]: "html" }))}
                          className={"rounded-md px-2 py-1 text-xs font-medium " + (tableMode === "html" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700")}
                        >
                          HTML
                        </button>
                        <button
                          type="button"
                          onClick={() => setTableViewModes((prev) => ({ ...prev, [tableIndex]: "raw" }))}
                          className={"rounded-md px-2 py-1 text-xs font-medium " + (tableMode === "raw" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700")}
                        >
                          Raw
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(html);
                              setCopyHtmlStatus((prev) => ({ ...prev, [tableIndex]: "copied" }));
                            } catch {
                              setCopyHtmlStatus((prev) => ({ ...prev, [tableIndex]: "failed" }));
                            }
                            window.setTimeout(() => {
                              setCopyHtmlStatus((prev) => ({ ...prev, [tableIndex]: "idle" }));
                            }, 1200);
                          }}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          {copyState === "copied" ? "HTML copied" : copyState === "failed" ? "Copy failed" : "Copy HTML"}
                        </button>
                      </div>

                      {tableMode === "html" ? (
                        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-zinc-900 p-3 text-xs text-zinc-100">
                          <code>{html}</code>
                        </pre>
                      ) : tableMode === "raw" ? (
                        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-zinc-50 p-3 text-xs text-zinc-800">
                          {tableBlock.type === "table"
                            ? [tableBlock.headers.join("  "), ...tableBlock.rows.map((row) => row.join("  "))].join("\n")
                            : tableBlock.text}
                        </pre>
                      ) : tableBlock.type === "table" ? (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-left text-xs text-zinc-800">
                            <thead className="bg-zinc-100">
                              <tr>
                                {tableBlock.headers.map((header, idx) => (
                                  <th key={`h-${tableIndex}-${idx}`} className="whitespace-nowrap px-3 py-2 font-semibold">
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {tableBlock.rows.map((row, rowIdx) => (
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
                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                          <div className="mb-1 text-xs font-semibold text-amber-900">{tableBlock.warning}</div>
                          <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-amber-900">{tableBlock.text}</pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {hasDuplicates ? (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-amber-900">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold">Repeated blocks hidden</span>
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
                      <ul key={`ul-${idx}`} className={"list-disc space-y-1 pl-5 " + (isDuplicate ? " rounded-lg bg-amber-50 p-2" : "")}>
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
                      <div key={`heading-${idx}`} className={"text-sm font-semibold text-zinc-900 " + (isDuplicate ? "rounded-lg bg-amber-50 p-2" : "")}>
                        {renderInlineText(block.text)}
                      </div>
                    );
                  }
                  return (
                    <p key={`p-${idx}`} className={"whitespace-pre-wrap leading-relaxed " + (isDuplicate ? "rounded-lg bg-amber-50 p-2" : "")}>
                      {renderInlineText(block.text)}
                    </p>
                  );
                })}
              </div>
            ) : (
              <div className="text-zinc-500">(no body detected)</div>
            )}
          </div>

          <aside className="rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-700">
            <div className="font-semibold text-zinc-900">Task metadata</div>
            <div className="mt-2 space-y-1">
              <div>Words: {totalWords}</div>
              <div>Pages: {pages.length ? pages.join(", ") : "—"}</div>
              <div>Status: {confidence}</div>
              <div>Warnings: {warningItems.length}</div>
              <div>Tables: {tableBlocks.length}</div>
              <div>Parts: {parsedParts.length}</div>
            </div>
            <div className="mt-3 border-t border-zinc-200 pt-2 text-zinc-500">Use “Copy text” for plain-text export.</div>
          </aside>
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
