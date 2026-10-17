/**
 * Transactional email helper for auth codes.
 *
 * Production: Resend (https://resend.com) via RESEND_API_KEY + EMAIL_FROM.
 * Local/dev: logs the message (and code) to the server console when no API key.
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendEmailResult =
  | { ok: true; provider: "resend" | "console" }
  | { ok: false; error: string };

function resendApiKey(): string | undefined {
  const key = process.env.RESEND_API_KEY?.trim();
  return key || undefined;
}

function emailFrom(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    "Gridiron IQ <onboarding@resend.dev>"
  );
}

/** True when we will actually call Resend (production-ready send). */
export function emailSendingConfigured(): boolean {
  return Boolean(resendApiKey());
}

/**
 * Send an email. Falls back to console logging when RESEND_API_KEY is unset
 * (safe local/dev). Never throws — callers decide how to surface failures.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = resendApiKey();

  if (!apiKey) {
    console.info(
      "[email] RESEND_API_KEY unset — logging email to console (dev/local):\n" +
        `To: ${input.to}\nSubject: ${input.subject}\n\n${input.text}\n`,
    );
    return { ok: true, provider: "console" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom(),
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html ?? undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[email] Resend send failed", res.status, body);
      return { ok: false, error: `Resend HTTP ${res.status}` };
    }

    return { ok: true, provider: "resend" };
  } catch (error) {
    console.error("[email] Resend request error", error);
    return { ok: false, error: "Resend request failed" };
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
