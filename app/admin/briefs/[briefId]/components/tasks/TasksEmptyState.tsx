export function TasksEmptyState({ onGoToExtract }: { onGoToExtract?: () => void }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="font-semibold">No tasks detected yet</div>
      <div className="mt-1">
        Run Extract on the BRIEF PDF in the inbox. If the template is odd, use the override editor below.
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onGoToExtract?.()}
          className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
        >
          Go to Extract tools
        </button>
      </div>
    </div>
  );
}
