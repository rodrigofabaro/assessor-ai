export function TasksControls({ onExpandAll, onCollapseAll }: { onExpandAll: () => void; onCollapseAll: () => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <div className="text-xs text-zinc-500">Default view is compact. Expand only the task you are reviewing.</div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onExpandAll}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Expand all
        </button>
        <button
          type="button"
          onClick={onCollapseAll}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Collapse all
        </button>
      </div>
    </div>
  );
}
