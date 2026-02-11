import { badge, getDocumentHint, type ReferenceDocument } from "../reference.logic";

export function ReferenceItemCard({
  document,
  active,
  onSelect,
}: {
  document: ReferenceDocument;
  active: boolean;
  onSelect: () => void;
}) {
  const b = badge(document.status);
  const hint = getDocumentHint(document);

  return (
    <tr
      onClick={onSelect}
      className={"cursor-pointer border-b border-zinc-100 hover:bg-zinc-50 " + (active ? "bg-zinc-50" : "bg-white")}
    >
      <td className="px-3 py-2">
        <span className={"inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold " + b.cls}>
          {b.text}
        </span>
      </td>
      <td className="px-3 py-2 text-zinc-700">{document.type}</td>
      <td className="px-3 py-2">
        <div className="font-semibold text-zinc-900">{document.title}</div>
        <div className="mt-0.5 text-xs text-zinc-600">{hint || document.originalFilename}</div>
      </td>
    </tr>
  );
}
