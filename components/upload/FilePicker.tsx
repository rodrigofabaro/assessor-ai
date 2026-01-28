"use client";

export function FilePicker({
  files,
  setFiles,
}: {
  files: File[];
  setFiles: (updater: (xs: File[]) => File[]) => void;
}) {
  return (
    <div className="mt-4 grid gap-2">
      <label className="text-sm font-medium" htmlFor="files">
        Files
      </label>
      <input
        id="files"
        type="file"
        multiple
        accept=".pdf,.docx"
        onChange={(e) => {
          const next = Array.from(e.target.files || []);
          setFiles(() => next);
        }}
        className="block w-full text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-800"
      />

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {files.map((f) => (
            <span
              key={f.name + f.size}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs"
              title={`${f.name} (${Math.round(f.size / 1024)} KB)`}
            >
              <span className="max-w-[240px] truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => setFiles((xs) => xs.filter((x) => x !== f))}
                className="rounded-full px-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
                aria-label={`Remove ${f.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
