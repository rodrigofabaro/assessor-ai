"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HELP_PAGES } from "@/lib/help/pages";
import type { HelpTutorial } from "@/lib/help/tutorials";

const CONTROL_KIND_ORDER = ["Filter", "Badge", "Button", "Alert", "Tab", "Toggle", "Field", "Card"] as const;
type ControlKind = (typeof CONTROL_KIND_ORDER)[number];

function sectionMatchesQuery(q: string, chunks: string[]) {
  if (!q) return true;
  const hay = chunks.join(" ").toLowerCase();
  return hay.includes(q);
}

function highlight(text: string, query: string) {
  const src = String(text || "");
  const q = String(query || "").trim();
  if (!q) return src;
  const i = src.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return src;
  const a = src.slice(0, i);
  const b = src.slice(i, i + q.length);
  const c = src.slice(i + q.length);
  return (
    <>
      {a}
      <mark className="rounded bg-amber-100 px-0.5">{b}</mark>
      {c}
    </>
  );
}

export default function HelpTopicClient({ tutorial }: { tutorial: HelpTutorial }) {
  const { slug, route, title, audience } = tutorial;
  const [query, setQuery] = useState("");
  const [controlKindFilter, setControlKindFilter] = useState<"All" | ControlKind>("All");
  const [controlSort, setControlSort] = useState<"type" | "label">("type");
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({});
  const [loadedProgress, setLoadedProgress] = useState(false);
  const [activeId, setActiveId] = useState<string>("");
  const progressKey = `help:tutorial-progress:${slug}`;
  const q = query.trim().toLowerCase();

  const visiblePreflight = useMemo(
    () =>
      tutorial.preflight
        .map((item, idxItem) => ({ item, idxItem }))
        .filter((entry) => sectionMatchesQuery(q, [entry.item])),
    [q, tutorial.preflight]
  );
  const visibleSteps = useMemo(
    () =>
      tutorial.steps.filter((step) =>
        sectionMatchesQuery(q, [step.title, step.what, step.why, ...step.how, ...(step.checks || [])])
      ),
    [q, tutorial.steps]
  );
  const visibleIssues = useMemo(
    () => tutorial.issues.filter((issue) => sectionMatchesQuery(q, [issue.issue, issue.cause, issue.fix])),
    [q, tutorial.issues]
  );
  const visibleControls = useMemo(
    () => {
      const base = (tutorial.uiControls || []).filter((control) =>
        sectionMatchesQuery(q, [control.kind, control.label, control.location, control.meaning, control.useWhen, control.impact])
      );
      const byKind = controlKindFilter === "All" ? base : base.filter((control) => control.kind === controlKindFilter);
      const sorted = [...byKind].sort((a, b) => {
        if (controlSort === "label") {
          return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
        }
        const aIdx = CONTROL_KIND_ORDER.indexOf(a.kind as ControlKind);
        const bIdx = CONTROL_KIND_ORDER.indexOf(b.kind as ControlKind);
        if (aIdx !== bIdx) return aIdx - bIdx;
        return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
      });
      return sorted;
    },
    [controlKindFilter, controlSort, q, tutorial.uiControls]
  );
  const availableControlKinds = useMemo(
    () => Array.from(new Set((tutorial.uiControls || []).map((control) => control.kind))).filter((kind): kind is ControlKind => CONTROL_KIND_ORDER.includes(kind as ControlKind)),
    [tutorial.uiControls]
  );
  const groupedVisibleControls = useMemo(
    () =>
      CONTROL_KIND_ORDER.map((kind) => ({
        kind,
        items: visibleControls.filter((control) => control.kind === kind),
      })).filter((group) => group.items.length > 0),
    [visibleControls]
  );

  const totalUnits = tutorial.preflight.length + tutorial.steps.length;
  const completedUnits =
    tutorial.preflight.reduce((acc, _item, idx) => acc + (doneMap[`preflight:${idx}`] ? 1 : 0), 0) +
    tutorial.steps.reduce((acc, step) => acc + (doneMap[`step:${step.id}`] ? 1 : 0), 0);
  const progressPct = totalUnits ? Math.min(100, Math.round((completedUnits / totalUnits) * 100)) : 0;

  const idx = HELP_PAGES.findIndex((p) => p.slug === slug);
  const prev = idx > 0 ? HELP_PAGES[idx - 1] : null;
  const next = idx >= 0 && idx < HELP_PAGES.length - 1 ? HELP_PAGES[idx + 1] : null;

  const related = useMemo(() => {
    const selfRoute = String(route || "");
    const key = selfRoute.startsWith("/admin")
      ? "/admin"
      : selfRoute.startsWith("/submissions")
        ? "/submissions"
        : selfRoute.startsWith("/students")
          ? "/students"
          : "/";
    return HELP_PAGES.filter((p) => p.slug !== slug && String(p.route).startsWith(key)).slice(0, 4);
  }, [route, slug]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(progressKey);
      if (raw) setDoneMap(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      setDoneMap({});
    } finally {
      setLoadedProgress(true);
    }
  }, [progressKey]);

  useEffect(() => {
    if (!loadedProgress) return;
    window.localStorage.setItem(progressKey, JSON.stringify(doneMap));
  }, [doneMap, loadedProgress, progressKey]);

  useEffect(() => {
    const defaults: Record<string, boolean> = {};
    tutorial.steps.forEach((step, i) => {
      defaults[step.id] = i === 0;
    });
    setOpenMap(defaults);
  }, [tutorial.slug, tutorial.steps]);

  useEffect(() => {
    setControlKindFilter("All");
    setControlSort("type");
  }, [tutorial.slug]);

  useEffect(() => {
    const sectionIds = [
      "tutorial-purpose",
      "tutorial-preflight",
      "tutorial-steps",
      "tutorial-controls",
      "tutorial-troubleshooting",
      "tutorial-screenshots",
      "tutorial-navigation",
      ...visibleSteps.map((step) => `step-${step.id}`),
    ];
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: [0.2, 0.5, 0.8] }
    );
    for (const sectionId of sectionIds) {
      const target = document.getElementById(sectionId);
      if (target) obs.observe(target);
    }
    return () => obs.disconnect();
  }, [visibleSteps]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = String((e.target as HTMLElement | null)?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "[" && prev) {
        window.location.href = `/help/${prev.slug}`;
      } else if (e.key === "]" && next) {
        window.location.href = `/help/${next.slug}`;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next]);

  return (
    <article className="grid gap-3 lg:grid-cols-[1fr_250px]">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <header className="border-b border-zinc-200 bg-gradient-to-br from-zinc-50 via-white to-cyan-50 px-5 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-900">
              Tutorial
            </span>
            <span className="inline-flex rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
              Route: {route}
            </span>
            <span className="inline-flex rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
              Audience: {audience}
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-700">{tutorial.purpose}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tutorial content..."
              className="h-9 w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                const nextState: Record<string, boolean> = {};
                tutorial.steps.forEach((s) => {
                  nextState[s.id] = true;
                });
                setOpenMap(nextState);
              }}
              className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Expand All Steps
            </button>
            <button
              type="button"
              onClick={() => {
                const nextState: Record<string, boolean> = {};
                tutorial.steps.forEach((s) => {
                  nextState[s.id] = false;
                });
                setOpenMap(nextState);
              }}
              className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Collapse All Steps
            </button>
            <button
              type="button"
              onClick={() => setDoneMap({})}
              className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
            >
              Reset Checkpoints
            </button>
          </div>
          <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-2">
            <div className="flex items-center justify-between text-xs text-zinc-600">
              <span className="font-semibold uppercase tracking-wide">Tutorial Progress</span>
              <span>
                {completedUnits}/{totalUnits}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </header>

        <div className="space-y-3 p-5 print:p-0">
          <section id="tutorial-purpose" className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <h2 className="text-sm font-semibold text-zinc-900">What This Page Is For</h2>
              <p className="mt-2 text-sm text-zinc-700">{highlight(tutorial.purpose, query)}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <h2 className="text-sm font-semibold text-zinc-900">How It Works</h2>
              <div className="mt-2 space-y-2">
                {tutorial.howItWorks.map((line, idxLine) => (
                  <div key={idxLine} className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-sm text-zinc-700">
                    {highlight(line, query)}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3">
              <h2 className="text-sm font-semibold text-zinc-900">Why It Matters</h2>
              <div className="mt-2 space-y-2">
                {tutorial.whyItMatters.map((line, idxLine) => (
                  <div key={idxLine} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-sm text-emerald-900">
                    {highlight(line, query)}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="tutorial-preflight" className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-sm font-semibold text-zinc-900">Preflight Checklist</div>
            <p className="mt-1 text-xs text-zinc-600">Complete this before using page actions.</p>
            <div className="mt-3 grid gap-2">
              {visiblePreflight.map((entry) => {
                const key = `preflight:${entry.idxItem}`;
                const checked = Boolean(doneMap[key]);
                return (
                  <label
                    key={`${entry.item}-${entry.idxItem}`}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-zinc-200 bg-white text-zinc-700"}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setDoneMap((prevMap) => ({ ...prevMap, [key]: !checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600"
                    />
                    <span>{highlight(entry.item, query)}</span>
                  </label>
                );
              })}
              {visiblePreflight.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-500">
                  No preflight items match the current search.
                </div>
              ) : null}
            </div>
          </section>

          <section id="tutorial-steps" className="rounded-xl border border-zinc-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-900">Step-by-Step Tutorial</h2>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{visibleSteps.length} visible</span>
            </div>
            <div className="mt-3 space-y-2">
              {visibleSteps.map((step, stepIdx) => {
                const doneKey = `step:${step.id}`;
                const isDone = Boolean(doneMap[doneKey]);
                const anchorId = `step-${step.id}`;
                return (
                  <details
                    key={step.id}
                    id={anchorId}
                    open={openMap[step.id] ?? stepIdx === 0}
                    onToggle={(e) => {
                      const isOpen = e.currentTarget.open;
                      setOpenMap((prevMap) => ({ ...prevMap, [step.id]: isOpen }));
                    }}
                    className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Step {stepIdx + 1}</div>
                        <div className="truncate text-sm font-semibold text-zinc-900">{highlight(step.title, query)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setDoneMap((prevMap) => ({ ...prevMap, [doneKey]: !isDone }));
                        }}
                        className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${isDone ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
                      >
                        {isDone ? "Completed" : "Mark Complete"}
                      </button>
                    </summary>
                    <div className="space-y-3 border-t border-zinc-200 bg-white px-3 py-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">What</div>
                        <p className="mt-1 text-sm text-zinc-700">{highlight(step.what, query)}</p>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">How</div>
                        <div className="mt-1 space-y-1">
                          {step.how.map((line, idxHow) => (
                            <div key={idxHow} className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-700">
                              {highlight(line, query)}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-sm text-sky-900">
                        <span className="font-semibold">Why:</span> {highlight(step.why, query)}
                      </div>
                      {step.checks?.length ? (
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Checks</div>
                          <div className="mt-1 space-y-1">
                            {step.checks.map((check, idxCheck) => (
                              <div key={idxCheck} className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-sm text-emerald-900">
                                {highlight(check, query)}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </details>
                );
              })}
              {visibleSteps.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                  No tutorial step matches the current search.
                </div>
              ) : null}
            </div>
          </section>

          <section id="tutorial-controls" className="rounded-xl border border-zinc-200 bg-white p-3">
            <h2 className="text-sm font-semibold text-zinc-900">UI Controls Reference</h2>
            <p className="mt-1 text-xs text-zinc-600">
              What each filter, badge, button, alert, tab, and toggle does on this page.
            </p>
            <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Type</span>
                <button
                  type="button"
                  onClick={() => setControlKindFilter("All")}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${controlKindFilter === "All" ? "border-sky-200 bg-sky-50 text-sky-900" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
                >
                  All ({tutorial.uiControls?.length || 0})
                </button>
                {availableControlKinds.map((kind) => {
                  const count = (tutorial.uiControls || []).filter((control) => control.kind === kind).length;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setControlKindFilter(kind)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${controlKindFilter === kind ? "border-sky-200 bg-sky-50 text-sky-900" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
                    >
                      {kind} ({count})
                    </button>
                  );
                })}
                <div className="ml-auto flex items-center gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500" htmlFor="ui-controls-sort">
                    Sort
                  </label>
                  <select
                    id="ui-controls-sort"
                    value={controlSort}
                    onChange={(e) => setControlSort(e.target.value as "type" | "label")}
                    className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700"
                  >
                    <option value="type">By Type</option>
                    <option value="label">A-Z Label</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {(controlSort === "type" ? groupedVisibleControls.flatMap((group) => group.items.map((item) => ({ item, group: group.kind }))) : visibleControls.map((item) => ({ item, group: null }))).map(({ item: control, group }, idxControl, arr) => {
                const prevGroup = idxControl > 0 ? arr[idxControl - 1]?.group : null;
                const showGroupHeader = controlSort === "type" && group && group !== prevGroup;
                return (
                  <div key={`${control.kind}-${control.label}-${idxControl}`}>
                    {showGroupHeader ? (
                      <div className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        {group} ({visibleControls.filter((c) => c.kind === group).length})
                      </div>
                    ) : null}
                    <details
                      open={idxControl === 0}
                      className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
                        <span className="truncate">{highlight(control.label, query)}</span>
                        <span className="inline-flex shrink-0 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                          {control.kind}
                        </span>
                      </summary>
                      <div className="space-y-2 border-t border-zinc-200 bg-white px-3 py-2">
                        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-sm text-zinc-700">
                          <span className="font-semibold">Location:</span> {highlight(control.location, query)}
                        </div>
                        <div className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-sm text-sky-900">
                          <span className="font-semibold">What it means:</span> {highlight(control.meaning, query)}
                        </div>
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-sm text-amber-900">
                          <span className="font-semibold">When to use:</span> {highlight(control.useWhen, query)}
                        </div>
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-sm text-emerald-900">
                          <span className="font-semibold">Impact:</span> {highlight(control.impact, query)}
                        </div>
                      </div>
                    </details>
                  </div>
                );
              })}
              {visibleControls.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                  No UI control reference matches the current search.
                </div>
              ) : null}
            </div>
          </section>

          <section id="tutorial-troubleshooting" className="rounded-xl border border-zinc-200 bg-white p-3">
            <h2 className="text-sm font-semibold text-zinc-900">Troubleshooting</h2>
            <div className="mt-3 space-y-2">
              {visibleIssues.map((issue, idxIssue) => (
                <details key={`${issue.issue}-${idxIssue}`} open={idxIssue === 0} className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
                  <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
                    {highlight(issue.issue, query)}
                  </summary>
                  <div className="space-y-2 border-t border-zinc-200 bg-white px-3 py-2">
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-sm text-amber-900">
                      <span className="font-semibold">Likely cause:</span> {highlight(issue.cause, query)}
                    </div>
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-sm text-emerald-900">
                      <span className="font-semibold">Recommended fix:</span> {highlight(issue.fix, query)}
                    </div>
                  </div>
                </details>
              ))}
              {visibleIssues.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                  No troubleshooting entry matches the current search.
                </div>
              ) : null}
            </div>
          </section>

          {tutorial.screenshots?.length ? (
            <section id="tutorial-screenshots" className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <h2 className="text-sm font-semibold text-zinc-900">Screenshot Checklist</h2>
              <p className="mt-1 text-xs text-zinc-600">Capture these views when building training material or handover notes.</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {tutorial.screenshots.map((shot, idxShot) => (
                  <div key={`${shot.title}-${idxShot}`} className="rounded-lg border border-zinc-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Shot {idxShot + 1}</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-900">{highlight(shot.title, query)}</div>
                    <p className="mt-1 text-sm text-zinc-700">{highlight(shot.caption, query)}</p>
                    {shot.src ? (
                      <div className="mt-2 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 p-1">
                        <Image
                          src={shot.src}
                          alt={shot.title}
                          width={1280}
                          height={720}
                          className="h-auto w-full rounded border border-zinc-200 bg-white"
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section id="tutorial-navigation" className="grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Previous / Next</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {prev ? (
                  <Link href={`/help/${prev.slug}`} className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                    [ {prev.title}
                  </Link>
                ) : null}
                {next ? (
                  <Link href={`/help/${next.slug}`} className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                    {next.title} ]
                  </Link>
                ) : null}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Related Topics</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {related.map((topic) => (
                  <Link key={topic.slug} href={`/help/${topic.slug}`} className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                    {topic.title}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </div>
      </section>

      <aside className="sticky top-3 hidden h-fit rounded-xl border border-zinc-200 bg-white p-3 shadow-sm lg:block">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">On this tutorial</div>
        <nav className="mt-2 grid gap-1">
          {[
            { id: "tutorial-purpose", label: "Purpose / How / Why" },
            { id: "tutorial-preflight", label: "Preflight Checklist" },
            { id: "tutorial-steps", label: "Step-by-Step" },
            { id: "tutorial-controls", label: "UI Controls Reference" },
            { id: "tutorial-troubleshooting", label: "Troubleshooting" },
            ...(tutorial.screenshots?.length ? [{ id: "tutorial-screenshots", label: "Screenshot Checklist" }] : []),
            { id: "tutorial-navigation", label: "Navigation" },
            ...visibleSteps.map((step) => ({ id: `step-${step.id}`, label: step.title })),
          ].map((entry) => (
            <a
              key={entry.id}
              href={`#${entry.id}`}
              className={`rounded-md px-2 py-1 text-xs font-semibold ${activeId === entry.id ? "bg-sky-50 text-sky-900" : "text-zinc-700 hover:bg-zinc-50"}`}
            >
              {entry.label}
            </a>
          ))}
        </nav>
      </aside>
    </article>
  );
}
