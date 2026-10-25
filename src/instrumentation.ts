import type { Instrumentation } from "next";

/**
 * Report unhandled server errors (pages, route handlers, server actions) to
 * the ops webhook. Node runtime only — the alert path uses Prisma for dedupe.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { sendOpsAlert, errorMessage } = await import("@/lib/ops/alert");
  const digest =
    typeof err === "object" && err !== null && "digest" in err
      ? String((err as { digest: unknown }).digest)
      : undefined;
  const path = request.path.split("?")[0];

  await sendOpsAlert({
    title: `Server error on ${request.method} ${path}`,
    detail: [
      errorMessage(err),
      `route: ${context.routePath} (${context.routeType})`,
      digest ? `digest: ${digest}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    dedupeKey: `request-error:${context.routePath}:${digest ?? errorMessage(err).slice(0, 80)}`,
  });
};
