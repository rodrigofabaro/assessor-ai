export type HelpPageMeta = {
  slug: string;
  title: string;
  route: string;
};

export const HELP_PAGES: HelpPageMeta[] = [
  { slug: "home", title: "Home Dashboard", route: "/" },
  { slug: "upload", title: "Upload", route: "/upload" },
  { slug: "submissions-list", title: "Submissions List", route: "/submissions" },
  { slug: "submissions-support", title: "Submissions Support Guide", route: "/submissions" },
  { slug: "submissions-onboarding", title: "Submissions Onboarding (First Run)", route: "/submissions" },
  { slug: "submission-detail", title: "Submission Detail", route: "/submissions/[submissionId]" },
  { slug: "students-pages", title: "Students Pages", route: "/students/[id], /admin/students" },
  { slug: "admin-index", title: "Admin Overview", route: "/admin" },
  { slug: "admin-qa", title: "Admin QA", route: "/admin/qa" },
  { slug: "admin-specs", title: "Admin Specs", route: "/admin/specs" },
  { slug: "admin-briefs", title: "Admin Briefs", route: "/admin/briefs, /admin/briefs/[briefId]" },
  { slug: "admin-reference", title: "Admin Reference", route: "/admin/reference" },
  { slug: "admin-library", title: "Admin Library", route: "/admin/library" },
  { slug: "admin-bindings", title: "Admin Bindings", route: "/admin/bindings" },
  { slug: "admin-settings", title: "Admin Settings", route: "/admin/settings" },
  { slug: "admin-audit-users", title: "Admin Audit + Users", route: "/admin/audit, /admin/users" },
];

export function getHelpPageMeta(slug: string) {
  return HELP_PAGES.find((p) => p.slug === slug) || null;
}
