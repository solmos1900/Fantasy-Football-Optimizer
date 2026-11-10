import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminUser, loadProductMetrics } from "@/lib/analytics/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Launch metrics as JSON (WAU, questions per user, cost per question).
 * Allowed for a signed-in admin (ADMIN_EMAILS) or with
 * Authorization: Bearer $CRON_SECRET for scripts. Optional ?weeks=1..26.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const bearerOk =
    Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (!bearerOk) {
    const session = await auth();
    if (!(await isAdminUser(session?.user?.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }
  const weeksParam = Number(new URL(request.url).searchParams.get("weeks"));
  const metrics = await loadProductMetrics({
    weeks: Number.isFinite(weeksParam) && weeksParam > 0 ? weeksParam : undefined,
  });
  return NextResponse.json(metrics, { headers: { "Cache-Control": "no-store" } });
}
