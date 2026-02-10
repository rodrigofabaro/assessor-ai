export type ParsedPart = {
  key: string;
  text: string;
  children?: ParsedPart[];
};

function normalizeText(text: string) {
  return (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function sortKey(key: string) {
  return key
    .split(".")
    .map((chunk) => {
      if (/^\d+$/.test(chunk)) return chunk.padStart(3, "0");
      return chunk;
    })
    .join(".");
}

function normalizeProvidedParts(parts: Array<{ key?: string; text?: string }> | undefined): ParsedPart[] {
  if (!Array.isArray(parts) || !parts.length) return [];
  const cleaned = parts
    .map((p) => ({ key: String(p?.key || "").trim().toLowerCase(), text: String(p?.text || "").trim() }))
    .filter((p) => p.key && p.text)
    .sort((a, b) => sortKey(a.key).localeCompare(sortKey(b.key)));

  if (!cleaned.length) return [];

  const byKey = new Map<string, ParsedPart>();
  cleaned.forEach((part) => byKey.set(part.key, { key: part.key, text: part.text, children: [] }));

  const roots: ParsedPart[] = [];
  cleaned.forEach((part) => {
    const node = byKey.get(part.key)!;
    const parentKey = part.key.includes(".") ? part.key.slice(0, part.key.lastIndexOf(".")) : "";
    if (parentKey && byKey.has(parentKey)) {
      byKey.get(parentKey)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots.map((node) => ({ ...node, children: node.children?.length ? node.children : undefined }));
}

function hasRomanContinuation(lines: string[], startIndex: number, lookahead = 6) {
  let seen = 0;
  for (let i = startIndex + 1; i < lines.length && seen < lookahead; i += 1) {
    const candidate = lines[i].trim();
    if (!candidate) continue;
    seen += 1;
    if (/^ii[\.)]\s+/i.test(candidate)) return true;
  }
  return false;
}

export function parseParts(text: string, providedParts?: Array<{ key?: string; text?: string }>): ParsedPart[] {
  const fromProvided = normalizeProvidedParts(providedParts);
  if (fromProvided.length) return fromProvided;

  const normalized = normalizeText(text);
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const topLevel: ParsedPart[] = [];
  let current: ParsedPart | null = null;
  let currentChild: ParsedPart | null = null;

  const flushChild = () => {
    if (currentChild && current) {
      if (!current.children) current.children = [];
      current.children.push({ ...currentChild });
    }
    currentChild = null;
  };

  const flushCurrent = () => {
    flushChild();
    if (current) topLevel.push({ ...current, children: current.children?.length ? current.children : undefined });
    current = null;
  };

  for (let idx = 0; idx < lines.length; idx += 1) {
    const rawLine = lines[idx];
    const line = rawLine.trim();
    if (!line) {
      if (currentChild) currentChild.text += "\n";
      else if (current) current.text += "\n";
      continue;
    }

    const topMatch = line.match(/^([a-z])[\.)]\s+(.*)$/i);
    if (topMatch) {
      const key = topMatch[1].toLowerCase();
      const shouldTreatAsRomanI = key === "i" && current && hasRomanContinuation(lines, idx);
      if (shouldTreatAsRomanI) {
        flushChild();
        currentChild = { key: `${current.key}.i`, text: topMatch[2].trim() };
        continue;
      }

      flushCurrent();
      current = { key, text: topMatch[2].trim() };
      continue;
    }

    const romanMatch = line.match(/^([ivxlcdm]+)[\.)]\s+(.*)$/i);
    if (romanMatch && current) {
      flushChild();
      currentChild = { key: `${current.key}.${romanMatch[1].toLowerCase()}`, text: romanMatch[2].trim() };
      continue;
    }

    if (currentChild) {
      currentChild.text += ` ${line}`;
    } else if (current) {
      current.text += ` ${line}`;
    }
  }

  flushCurrent();
  return topLevel.length >= 2 ? topLevel : [];
}
