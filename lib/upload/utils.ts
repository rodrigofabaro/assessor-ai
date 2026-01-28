export function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export async function safeJson(res: Response) {
  return res.json().catch(() => ({}));
}
