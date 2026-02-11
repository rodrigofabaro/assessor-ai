import { type ReferenceDocument } from "../reference.logic";
import { ReferenceItemCard } from "./ReferenceItemCard";

export function ReferenceList({
  documents,
  selectedDocId,
  onSelect,
}: {
  documents: ReferenceDocument[];
  selectedDocId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-3 max-h-[520px] overflow-auto rounded-xl border border-zinc-200">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="text-left text-xs text-zinc-600">
            <th className="border-b border-zinc-200 px-3 py-2">Status</th>
            <th className="border-b border-zinc-200 px-3 py-2">Type</th>
            <th className="border-b border-zinc-200 px-3 py-2">Title</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <ReferenceItemCard
              key={document.id}
              document={document}
              active={document.id === selectedDocId}
              onSelect={() => onSelect(document.id)}
            />
          ))}
        </tbody>
      </table>

      {documents.length === 0 ? <div className="p-3 text-sm text-zinc-600">No documents match your filters.</div> : null}
    </div>
  );
}
