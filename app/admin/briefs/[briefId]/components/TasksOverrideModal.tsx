"use client";

import { useEffect, useMemo, useState } from "react";
import type { BriefTask } from "../briefDetail.logic";

function formatSubparts(text: string) {
  if (!text) return text;
  let s = text.replace(/\r\n/g, "\n");

  // Put each subpart on its own paragraph: blank line before (a), (b), (c) etc.
  s = s.replace(/\s*\(\s*([a-z])\s*\)\s*/gi, "\n\n($1) ");
  s = s.replace(/\s*\b([a-z])\)\s*/gi, "\n\n$1) ");

  // Collapse excessive blank lines
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}


function stripDuplicateTaskPrefix(s: string, n: number) {
  return (s || "").replace(new RegExp(`^\\s*Task\\s*${n}\\s*[:–-]?\\s*`, "i"), "");
}

function normalizeTaskLabel(t: Partial<BriefTask>, idx: number) {
  const fallback = `Task ${idx}`;
  const raw = (t.label || t.heading || fallback).toString().trim();
  return raw || fallback;
}

export function TasksOverrideModal(props: {
  open: boolean;
  onClose: () => void;
  extractedTasks: BriefTask[];
  overrideTasks: BriefTask[] | null;
  busy?: boolean;
  onSave: (next: BriefTask[] | null) => Promise<void>;
}) {
  const { open, onClose, extractedTasks, overrideTasks, onSave, busy } = props;

  const extracted = useMemo(() => (Array.isArray(extractedTasks) ? extractedTasks : []), [extractedTasks]);
  const base = useMemo(() => {
    const src = overrideTasks && overrideTasks.length ? overrideTasks : extracted;
    return (src || []).map((t, i) => {
      const idx = i + 1;
      const label = normalizeTaskLabel(t, idx);
      const heading = (t.heading ?? "").toString();
      const text = stripDuplicateTaskPrefix((t.text ?? "").toString(), idx);
      return {
        n: typeof t.n === "number" && t.n >= 1 ? t.n : idx,
        label,
        heading,
        text,
        warnings: Array.isArray(t.warnings) ? t.warnings.map(String) : [],
      };
    });
  }, [overrideTasks, extracted]);

  const [draft, setDraft] = useState(base);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(base);
  }, [open, base]);

  if (!open) return null;

  const disabled = !!busy || saving;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={() => !disabled && onClose()} />
      <div className="relative mx-4 w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 p-5">
          <div>
            <h3 className="text-base font-semibold tracking-tight">Edit task overrides</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Overrides are stored in document metadata for audit. The locked PDF is not changed.
            </p>
          </div>
          <button
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50"
            onClick={onClose}
            disabled={disabled}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto p-5">
          <div className="grid gap-5">
            {draft.map((t, i) => {
              const idx = i + 1;
              const ex = extracted[i] || ({ n: idx, label: `Task ${idx}`, heading: null, text: "", warnings: [] } as any);
              const exText = stripDuplicateTaskPrefix((ex.text ?? "").toString(), idx);
              const exLabel = normalizeTaskLabel(ex, idx);
              const exHeading = (ex.heading ?? "").toString();

              return (
                <div key={idx} className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-zinc-900">Task {idx}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                        onClick={() =>
                          setDraft((d) => d.map((x, j) => (j === i ? { ...x, text: formatSubparts(x.text) } : x)))
                        }
                        disabled={disabled}
                      >
                        Format (a)(b)(c)
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                        onClick={() =>
                          setDraft((d) =>
                            d.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    label: exLabel,
                                    heading: exHeading,
                                    text: exText,
                                  }
                                : x
                            )
                          )
                        }
                        disabled={disabled}
                      >
                        Restore extracted
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                        onClick={() => setDraft((d) => d.map((x, j) => (j === i ? { ...x, text: "" } : x)))}
                        disabled={disabled}
                      >
                        Clear text
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {/* Extracted */}
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <div className="text-xs font-semibold text-zinc-600">Extracted (read-only)</div>
                      <div className="mt-2 text-xs text-zinc-600">Label</div>
                      <div className="text-sm text-zinc-900">{exLabel}</div>
                      {exHeading ? (
                        <>
                          <div className="mt-2 text-xs text-zinc-600">Heading</div>
                          <div className="text-sm text-zinc-900">{exHeading}</div>
                        </>
                      ) : null}
                      <div className="mt-2 text-xs text-zinc-600">Text</div>
                      <pre className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-900">{exText || "(no body detected)"}</pre>
                    </div>

                    {/* Override */}
                    <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                      <div className="text-xs font-semibold text-zinc-600">Override (editable)</div>

                      <label className="mt-2 block text-xs font-semibold text-zinc-600">Label</label>
                      <input
                        value={t.label}
                        disabled={disabled}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft((d) => d.map((x, j) => (j === i ? { ...x, label: v } : x)));
                        }}
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 disabled:opacity-50"
                      />

                      <label className="mt-3 block text-xs font-semibold text-zinc-600">Heading (optional)</label>
                      <input
                        value={t.heading}
                        disabled={disabled}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft((d) => d.map((x, j) => (j === i ? { ...x, heading: v } : x)));
                        }}
                        className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 disabled:opacity-50"
                      />

                      <label className="mt-3 block text-xs font-semibold text-zinc-600">Text</label>
                      <textarea
                        className="mt-1 min-h-[160px] w-full resize-y rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-zinc-400 disabled:opacity-50"
                        value={t.text}
                        disabled={disabled}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft((d) => d.map((x, j) => (j === i ? { ...x, text: v } : x)));
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 p-5">
          <button
            type="button"
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50"
            onClick={() => !disabled && onClose()}
            disabled={disabled}
          >
            Cancel
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50"
              onClick={() =>
                setDraft(
                  extracted.map((t, i) => {
                    const idx = i + 1;
                    return {
                      n: typeof t.n === "number" && t.n >= 1 ? t.n : idx,
                      label: normalizeTaskLabel(t, idx),
                      heading: (t.heading ?? "").toString(),
                      text: stripDuplicateTaskPrefix((t.text ?? "").toString(), idx),
                      warnings: Array.isArray(t.warnings) ? t.warnings.map(String) : [],
                    };
                  })
                )
              }
              disabled={disabled}
            >
              Restore all extracted
            </button>

            <button
              type="button"
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
              disabled={disabled}
              onClick={async () => {
                setSaving(true);
                try {
                  // If override equals extracted (after stripping duplicated Task prefixes), treat as "no override".
                  const cleanedExtracted = extracted.map((t, i) => {
                    const idx = i + 1;
                    return {
                      n: typeof t.n === "number" && t.n >= 1 ? t.n : idx,
                      label: normalizeTaskLabel(t, idx).trim(),
                      heading: (t.heading ?? "").toString().trim(),
                      text: stripDuplicateTaskPrefix((t.text ?? "").toString(), idx).trim(),
                    };
                  });

                  const cleanedDraft = draft.map((t) => ({
                    n: typeof t.n === "number" && t.n >= 1 ? t.n : 0,
                    label: (t.label || "").toString().trim(),
                    heading: (t.heading || "").toString().trim(),
                    text: (t.text || "").toString().trim(),
                  }));

                  const same =
                    cleanedDraft.length === cleanedExtracted.length &&
                    cleanedDraft.every((t, i) =>
                      t.n === cleanedExtracted[i].n &&
                      t.label === cleanedExtracted[i].label &&
                      t.heading === cleanedExtracted[i].heading &&
                      t.text === cleanedExtracted[i].text
                    );

                  const next: BriefTask[] | null = same
                    ? null
                    : cleanedDraft
                        .map((t, i) => ({
                          n: t.n || i + 1,
                          label: t.label || `Task ${i + 1}`,
                          heading: t.heading || null,
                          text: t.text,
                        }))
                        .filter((t) => t.n >= 1);

                  await onSave(next);
                  onClose();
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving…" : "Save overrides"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
