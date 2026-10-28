import assert from "node:assert/strict";
import { sendEmail } from "../src/lib/email/send";

async function main() {
  process.env.RESEND_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_url: URL | RequestInfo, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    })) as typeof fetch;

  try {
    const result = await Promise.race([
      sendEmail({ to: "test@example.com", subject: "test", text: "test" }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Resend request did not time out")), 11_000),
      ),
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.detail, "Resend request failed");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
  }
  console.log("verify-resend-timeout: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
