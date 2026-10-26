/**
 * Transactional email helper for auth codes.
 *
 * Production: Resend (https://resend.com) via RESEND_API_KEY + EMAIL_FROM.
 * Local/dev (not on Vercel): logs the message to the server console when no API key.
 * On Vercel (Production or Preview): missing RESEND_API_KEY fails clearly — never silent.
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendEmailResult =
  | { ok: true; provider: "resend" | "console" }
  | { ok: false; error: string; detail?: string };

const RESEND_REQUEST_TIMEOUT_MS = 10_000;

function resendApiKey(): string | undefined {
  const key = process.env.RESEND_API_KEY?.trim();
  return key || undefined;
}

/** From address used for Resend. Reads EMAIL_FROM, then RESEND_FROM, then Resend's test sender. */
export function resolveEmailFrom(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    "Gridiron IQ <onboarding@resend.dev>"
  );
}

/** True when we will actually call Resend. */
export function emailSendingConfigured(): boolean {
  return Boolean(resendApiKey());
}

function runningOnVercel(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

function isDeployedProductionLike(): boolean {
  // Fail closed on any Vercel deployment and on NODE_ENV=production so codes
  // are never "sent" only to server logs where the user cannot see them.
  return runningOnVercel() || process.env.NODE_ENV === "production";
}

/**
 * Send an email.
 * - Local/dev without RESEND_API_KEY: console log (ok for developers).
 * - Vercel / production without RESEND_API_KEY: clear failure (not silent).
 * - Resend API errors: clear failure with status + provider message.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = resendApiKey();
  const from = resolveEmailFrom();

  if (!apiKey) {
    if (isDeployedProductionLike()) {
      console.error(
        "[email] RESEND_API_KEY is missing on a deployed/production environment. " +
          "Set it in Vercel → Project → Settings → Environment Variables " +
          `(target: ${process.env.VERCEL_ENV ?? "production"}). Cannot email ${input.to}.`,
      );
      return {
        ok: false,
        error:
          "We couldn't send the verification email because email delivery is not configured on this deployment.",
        detail: "RESEND_API_KEY missing",
      };
    }

    console.info(
      "[email] RESEND_API_KEY unset — logging email to console (dev/local):\n" +
        `From: ${from}\nTo: ${input.to}\nSubject: ${input.subject}\n\n${input.text}\n`,
    );
    return { ok: true, provider: "console" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(RESEND_REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html ?? undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        "[email] Resend send failed",
        { status: res.status, from, to: input.to, body: body.slice(0, 500) },
      );

      // Resend's onboarding@resend.dev only delivers to the account owner's inbox.
      const lower = body.toLowerCase();
      if (
        res.status === 403 ||
        res.status === 422 ||
        lower.includes("only send testing emails") ||
        lower.includes("testing email") ||
        lower.includes("verify a domain")
      ) {
        return {
          ok: false,
          error:
            "We couldn't deliver the verification email to that address. " +
            "With the Resend test sender, codes only reach the Resend account owner's own email. " +
            "Try that email, or verify a sending domain and update EMAIL_FROM.",
          detail: `Resend HTTP ${res.status}`,
        };
      }

      return {
        ok: false,
        error:
          "We couldn't send the verification email right now. Please try again in a minute.",
        detail: `Resend HTTP ${res.status}`,
      };
    }

    return { ok: true, provider: "resend" };
  } catch (error) {
    console.error("[email] Resend request error", error);
    return {
      ok: false,
      error:
        "We couldn't reach the email service. Please try again in a minute.",
      detail: "Resend request failed",
    };
  }
}

export async function sendVerificationCodeEmail(
  to: string,
  code: string,
): Promise<SendEmailResult> {
  const subject = "Your Gridiron IQ verification code";
  const text =
    `Your Gridiron IQ verification code is: ${code}\n\n` +
    `It expires in 15 minutes. If you did not create an account, you can ignore this email.`;
  const html =
    `<p>Your Gridiron IQ verification code is:</p>` +
    `<p style="font-size:24px;font-weight:700;letter-spacing:0.2em">${code}</p>` +
    `<p>It expires in 15 minutes. If you did not create an account, you can ignore this email.</p>`;

  return sendEmail({ to, subject, text, html });
}
