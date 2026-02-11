import { Pill } from "../../../components/ui";
import { tone } from "../briefStyles";

export function TasksTabHeader({
  hasOverride,
  onEditOverride,
}: {
  hasOverride: boolean;
  onEditOverride: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">Tasks & questions</h2>
        <p className="mt-1 text-sm text-zinc-700">
          This is the brief&apos;s “question paper”. The grader will later check student evidence against these task
          blocks.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Pill cls={hasOverride ? tone("info") : tone("muted")}>{hasOverride ? "OVERRIDE" : "EXTRACTED"}</Pill>

        <button
          type="button"
          onClick={onEditOverride}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
        >
          Edit override
        </button>
      </div>
    </div>
  );
}
