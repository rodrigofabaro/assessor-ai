export function TasksWarnings({ warnings }: { warnings: any[] }) {
  if (!warnings.length) return null;

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="font-semibold">Extraction warnings</div>
      <ul className="mt-1 list-disc pl-5">
        {warnings.map((w: any, i: number) => (
          <li key={i}>{String(w)}</li>
        ))}
      </ul>
    </div>
  );
}
