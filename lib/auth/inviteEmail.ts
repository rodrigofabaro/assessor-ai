type InviteEmailResult = {
  attempted: boolean;
  sent: boolean;
  provider: string;
  id?: string;
  error?: string;
};

function isTruthy(value: unknown) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function resolveProvider() {
  const raw = String(process.env.AUTH_INVITE_EMAIL_PROVIDER || process.env.AUTH_EMAIL_PROVIDER || "none")
    .trim()
    .toLowerCase();
  if (raw === "resend") return "resend";
  return "none";
}

export function canSendInviteEmail() {
  const provider = resolveProvider();
  if (provider === "resend") {
    return !!String(process.env.RESEND_API_KEY || "").trim() && !!String(process.env.AUTH_EMAIL_FROM || "").trim();
  }
  return false;
}

export async function sendInviteEmail(input: {
  to: string;
  fullName: string;
  password: string;
}): Promise<InviteEmailResult> {
  const to = String(input.to || "").trim().toLowerCase();
  const fullName = String(input.fullName || "").trim();
  const password = String(input.password || "");
  if (!to || !password) {
    return { attempted: false, sent: false, provider: resolveProvider(), error: "Missing recipient or password." };
  }

  const provider = resolveProvider();
  if (provider === "none") {
    return { attempted: false, sent: false, provider: "none" };
  }

  if (provider === "resend") {
    const apiKey = String(process.env.RESEND_API_KEY || "").trim();
    const from = String(process.env.AUTH_EMAIL_FROM || "").trim();
    if (!apiKey || !from) {
      return {
        attempted: true,
        sent: false,
        provider,
        error: "RESEND_API_KEY or AUTH_EMAIL_FROM is not configured.",
      };
    }

    const subject = "Your Assessor AI login credentials";
    const text = [
      `Hello ${fullName || "there"},`,
      "",
      "Your Assessor AI account is ready.",
      "Login URL: https://www.assessor-ai.co.uk/login",
      `Username: ${to}`,
      `Password: ${password}`,
      "",
      "Please sign in and keep this password private.",
    ].join("\n");

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) {
        return {
          attempted: true,
          sent: false,
          provider,
          error: String(payload?.message || `Resend returned ${res.status}.`).trim(),
        };
      }
      return { attempted: true, sent: true, provider, id: String(payload?.id || "") || undefined };
    } catch (error: unknown) {
      return {
        attempted: true,
        sent: false,
        provider,
        error: String((error as { message?: string })?.message || "Invite email send failed."),
      };
    }
  }

  return { attempted: false, sent: false, provider };
}

export function resolveInviteEmailUiSupport() {
  const provider = resolveProvider();
  return {
    provider,
    configured: canSendInviteEmail(),
    enabledByDefault: isTruthy(process.env.AUTH_INVITE_EMAIL_DEFAULT_ON),
  };
}
