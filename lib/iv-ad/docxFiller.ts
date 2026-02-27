import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

type XmlNode = any;

export type IvAdDocxFillInput = {
  programmeTitle: string;
  unitCodeTitle: string;
  assessorName: string;
  internalVerifierName: string;
  assignmentTitle: string;
  studentName: string;
  grade: string;
  generalComments: string;
  actionRequired: string;
  internalVerifierSignature?: string;
  assessorSignature?: string;
  signatureDate?: string;
};

export type IvAdDocxFillResult = {
  buffer: Buffer;
  tableShape: { rowCount: number; maxVisualCols: number };
};

function localName(node: XmlNode): string {
  return String(node?.localName || node?.nodeName || "").replace(/^.*:/, "");
}

function childElements(node: XmlNode, name?: string): XmlNode[] {
  const out: XmlNode[] = [];
  const wanted = name ? name.toLowerCase() : "";
  const list = node?.childNodes || [];
  for (let i = 0; i < list.length; i += 1) {
    const child = list[i];
    if (!child || child.nodeType !== 1) continue;
    if (!wanted || localName(child).toLowerCase() === wanted) out.push(child);
  }
  return out;
}

function firstChildElement(node: XmlNode, name: string): XmlNode | null {
  return childElements(node, name)[0] ?? null;
}

function descendantsByName(node: XmlNode, name: string): XmlNode[] {
  const out: XmlNode[] = [];
  const wanted = String(name || "").toLowerCase();
  const walk = (n: XmlNode) => {
    const list = n?.childNodes || [];
    for (let i = 0; i < list.length; i += 1) {
      const child = list[i];
      if (!child || child.nodeType !== 1) continue;
      if (localName(child).toLowerCase() === wanted) out.push(child);
      walk(child);
    }
  };
  walk(node);
  return out;
}

function firstDescendant(node: XmlNode, name: string): XmlNode | null {
  return descendantsByName(node, name)[0] ?? null;
}

function attrValue(node: XmlNode, attrName: string): string {
  if (!node?.attributes) return "";
  for (let i = 0; i < node.attributes.length; i += 1) {
    const attr = node.attributes[i];
    if (!attr) continue;
    const raw = String(attr.name || "");
    const local = raw.replace(/^.*:/, "");
    if (raw === attrName || local === attrName) return String(attr.value || "");
  }
  return "";
}

function gridSpanForCell(tc: XmlNode): number {
  const tcPr = firstChildElement(tc, "tcPr");
  const gridSpan = tcPr ? firstChildElement(tcPr, "gridSpan") : null;
  const raw = gridSpan ? attrValue(gridSpan, "val") : "";
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function firstTable(doc: XmlNode): XmlNode | null {
  return firstDescendant(doc, "tbl");
}

function tableRows(tbl: XmlNode): XmlNode[] {
  return childElements(tbl, "tr");
}

function rowCells(row: XmlNode): XmlNode[] {
  return childElements(row, "tc");
}

function visualColumnCount(row: XmlNode): number {
  return rowCells(row).reduce((sum, tc) => sum + gridSpanForCell(tc), 0);
}

function cellAtVisualColumn(row: XmlNode, colIndex: number): XmlNode | null {
  let visualCol = 0;
  for (const tc of rowCells(row)) {
    const span = gridSpanForCell(tc);
    if (colIndex >= visualCol && colIndex < visualCol + span) return tc;
    visualCol += span;
  }
  return null;
}

function clearParagraphContentKeepProps(p: XmlNode) {
  const keep = childElements(p, "pPr")[0] ?? null;
  const remove: XmlNode[] = [];
  const list = p.childNodes || [];
  for (let i = 0; i < list.length; i += 1) {
    const child = list[i];
    if (!child) continue;
    if (keep && child === keep) continue;
    remove.push(child);
  }
  for (const node of remove) {
    p.removeChild(node);
  }
}

function appendLineRun(doc: XmlNode, p: XmlNode, text: string) {
  const r = doc.createElement("w:r");
  const t = doc.createElement("w:t");
  if (/^\s|\s$/.test(text)) {
    t.setAttribute("xml:space", "preserve");
  }
  t.appendChild(doc.createTextNode(text));
  r.appendChild(t);
  p.appendChild(r);
}

function appendBreak(doc: XmlNode, p: XmlNode) {
  const r = doc.createElement("w:r");
  const br = doc.createElement("w:br");
  r.appendChild(br);
  p.appendChild(r);
}

function replaceCellText(tc: XmlNode, text: string) {
  const doc = tc.ownerDocument;
  let paragraphs = childElements(tc, "p");
  let p = paragraphs[0] ?? null;
  if (!p) {
    p = doc.createElement("w:p");
    tc.appendChild(p);
    paragraphs = [p];
  }

  clearParagraphContentKeepProps(p);

  // Remove additional paragraphs so the merged cells keep a compact single-paragraph layout.
  for (let i = 1; i < paragraphs.length; i += 1) {
    tc.removeChild(paragraphs[i]);
  }

  const normalized = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (!lines.length) {
    appendLineRun(doc, p, "");
    return;
  }
  lines.forEach((line, idx) => {
    appendLineRun(doc, p, line);
    if (idx < lines.length - 1) appendBreak(doc, p);
  });
}

export function setCellText(doc: XmlNode, rowIndex: number, colIndex: number, text: string) {
  const tbl = firstTable(doc);
  if (!tbl) throw new Error("DOCX template does not contain a table.");
  const rows = tableRows(tbl);
  const row = rows[rowIndex];
  if (!row) throw new Error(`DOCX template table row ${rowIndex} not found.`);
  const cell = cellAtVisualColumn(row, colIndex);
  if (!cell) throw new Error(`DOCX template table cell row ${rowIndex}, col ${colIndex} not found.`);
  replaceCellText(cell, text);
}

export function setMergedCellText(doc: XmlNode, rowIndex: number, colIndex: number, text: string) {
  setCellText(doc, rowIndex, colIndex, text);
}

export async function fillIvAdTemplateDocx(templateBuffer: Buffer, input: IvAdDocxFillInput): Promise<IvAdDocxFillResult> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) throw new Error("DOCX template is missing word/document.xml.");

  const xml = await docXmlFile.async("string");
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");

  const tbl = firstTable(doc);
  if (!tbl) throw new Error("DOCX template does not contain a primary table.");
  const rows = tableRows(tbl);
  const maxVisualCols = rows.reduce((max, row) => Math.max(max, visualColumnCount(row)), 0);

  // Header cells
  setCellText(doc, 1, 2, input.programmeTitle);
  setCellText(doc, 2, 2, input.unitCodeTitle);
  setCellText(doc, 3, 2, input.assessorName);
  setCellText(doc, 3, 6, input.internalVerifierName);
  setCellText(doc, 4, 2, input.assignmentTitle);

  // Student decision row
  setCellText(doc, 6, 0, input.studentName);
  setCellText(doc, 6, 1, "First");
  setCellText(doc, 6, 2, input.grade);
  setCellText(doc, 6, 3, "Y");
  setCellText(doc, 6, 4, "N/A");
  setCellText(doc, 6, 6, "N/A");

  // Checklist
  setCellText(doc, 8, 7, "Y");
  setCellText(doc, 9, 7, "N");

  // Comments / actions
  setMergedCellText(doc, 12, 0, input.generalComments);
  setMergedCellText(doc, 16, 0, input.actionRequired);
  setCellText(doc, 16, 5, "Within 5 working days of IV");

  // Footer signatures
  const signatureDate = String(input.signatureDate || "").trim();
  const internalVerifierSignature = String(input.internalVerifierSignature || "").trim();
  const assessorSignature = String(input.assessorSignature || "").trim();
  if (internalVerifierSignature) setCellText(doc, 21, 2, internalVerifierSignature);
  if (assessorSignature) setCellText(doc, 22, 2, assessorSignature);
  if (signatureDate) {
    setCellText(doc, 21, 9, signatureDate);
    setCellText(doc, 22, 9, signatureDate);
  }

  const nextXml = new XMLSerializer().serializeToString(doc);
  zip.file("word/document.xml", nextXml);
  const out = await zip.generateAsync({ type: "nodebuffer" });
  return {
    buffer: Buffer.from(out),
    tableShape: { rowCount: rows.length, maxVisualCols },
  };
}
