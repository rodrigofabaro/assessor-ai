import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { getHelpPageMeta, HELP_PAGES } from "@/lib/help/pages";
import HelpTopicClient from "./HelpTopicClient";

export const dynamic = "force-static";

type Params = { slug: string };
type Block =
  | { type: "h1" | "h2" | "h3" | "li" | "p"; text: string }
  | { type: "img"; text: string; src: string };

function readHelpMarkdown(slug: string) {
  const file = path.join(process.cwd(), "docs", "help", `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
}

function markdownToBlocks(md: string) {
  const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const image = t.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (image) {
      const alt = String(image[1] || "").trim();
      const src = String(image[2] || "").trim();
      if (src) blocks.push({ type: "img", text: alt, src });
      continue;
    }
    if (t.startsWith("# ")) blocks.push({ type: "h1", text: t.slice(2).trim() });
    else if (t.startsWith("## ")) blocks.push({ type: "h2", text: t.slice(3).trim() });
    else if (t.startsWith("### ")) blocks.push({ type: "h3", text: t.slice(4).trim() });
    else if (t.startsWith("- ")) blocks.push({ type: "li", text: t.slice(2).trim() });
    else blocks.push({ type: "p", text: t });
  }
  return blocks;
}

function slugify(input: string) {
  return String(input || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function generateStaticParams() {
  return HELP_PAGES.map((p) => ({ slug: p.slug }));
}

export default async function HelpTopicPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const meta = getHelpPageMeta(slug);
  if (!meta) return notFound();
  const md = readHelpMarkdown(slug);
  if (!md) return notFound();
  const blocks = markdownToBlocks(md);
  const pageTitle = blocks.find((b) => b.type === "h1")?.text || meta.title;
  const sections: Array<{ id: string; title: string; items: Array<{ type: "h3" | "li" | "p" | "img"; text: string; src?: string }> }> = [];
  let current: { id: string; title: string; items: Array<{ type: "h3" | "li" | "p" | "img"; text: string; src?: string }> } | null = null;
  for (const b of blocks) {
    if (b.type === "h1") continue;
    if (b.type === "h2") {
      current = { id: slugify(b.text), title: b.text, items: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { id: "overview", title: "Overview", items: [] };
      sections.push(current);
    }
    if (b.type === "h3" || b.type === "li" || b.type === "p") current.items.push({ type: b.type, text: b.text });
    if (b.type === "img") current.items.push({ type: "img", text: b.text, src: b.src });
  }

  return <HelpTopicClient slug={slug} route={meta.route} pageTitle={pageTitle} sections={sections} />;
}
