import ResetPasswordForm from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

type ResetPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

export default function ResetPasswordPage({ searchParams }: ResetPageProps) {
  const rid = readParam(searchParams?.rid);
  const token = readParam(searchParams?.t);
  return <ResetPasswordForm rid={rid} token={token} />;
}
