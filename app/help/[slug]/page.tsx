import { notFound } from "next/navigation";
import { HELP_PAGES } from "@/lib/help/pages";
import { getHelpTutorial } from "@/lib/help/tutorials";
import HelpTopicClient from "./HelpTopicClient";

export const dynamic = "force-static";

type Params = { slug: string };

export function generateStaticParams() {
  return HELP_PAGES.map((p) => ({ slug: p.slug }));
}

export default async function HelpTopicPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const tutorial = getHelpTutorial(slug);
  if (!tutorial) return notFound();
  return <HelpTopicClient tutorial={tutorial} />;
}
