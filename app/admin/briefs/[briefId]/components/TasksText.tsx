"use client";

type Subpart = { key: string; label?: string; text: string };

function parseSubparts(text: string): Subpart[] {
  if (!text) return [{ key: "body", text: "" }];

  const normalized = text.replace(/\r\n/g, "\n");
  const regex = /\(([a-z])\)\s*/gi;

  const parts: Subpart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalized))) {
    if (match.index > lastIndex) {
      const before = normalized.slice(lastIndex, match.index).trim();
      if (before) parts.push({ key: `body-${lastIndex}`, text: before });
    }

    parts.push({ key: `part-${match[1]}-${match.index}`, label: `(${match[1]})`, text: "" });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < normalized.length) {
    parts.push({ key: `tail-${lastIndex}`, text: normalized.slice(lastIndex).trim() });
  }

  for (let i = 0; i < parts.length; i++) {
    if (parts[i].label && parts[i + 1] && !parts[i + 1].label) {
      parts[i].text = parts[i + 1].text;
      parts.splice(i + 1, 1);
    }
  }

  return parts;
}

export function TasksText({ text }: { text: string }) {
  const parts = parseSubparts(text || "");

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-900">
      {parts.map((p) => (
        <div key={p.key} className="mb-3 last:mb-0">
          {p.label ? (
            <div className="flex gap-2">
              <span className="font-semibold">{p.label}</span>
              <span className="whitespace-pre-wrap">{p.text}</span>
            </div>
          ) : (
            <div className="whitespace-pre-wrap">{p.text}</div>
          )}
        </div>
      ))}
    </div>
  );
}
