export const dynamic = "force-dynamic";
import LoginForm from "./LoginForm";

type LoginPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const nextRaw = searchParams?.next;
  const nextValue = Array.isArray(nextRaw) ? nextRaw[0] : nextRaw;
  const requestedPath = String(nextValue || "/").trim();
  const nextPath =
    requestedPath.startsWith("/") && !requestedPath.startsWith("//")
      ? requestedPath
      : "/";
  return <LoginForm nextPath={nextPath} />;
}
