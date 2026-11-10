import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/http/api-guard";
import {
  isClientAnalyticsEvent,
  trackEvent,
} from "@/lib/analytics/events";

export const dynamic = "force-dynamic";

const PropValue = z.union([z.string().max(60), z.number().finite(), z.boolean(), z.null()]);
const BodySchema = z.object({
  name: z.string().max(40),
  props: z.record(z.string().max(30), PropValue).optional(),
});

/** Feature-usage events from the browser (allowlisted names only). */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, {
    bucket: "analytics-event",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isClientAnalyticsEvent(parsed.data.name)) {
    return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  }
  const props = Object.fromEntries(
    Object.entries(parsed.data.props ?? {}).slice(0, 6),
  );

  await trackEvent({
    name: parsed.data.name,
    userId: session.user.id,
    isGuest: Boolean(session.user.isGuest),
    props,
  });
  return new NextResponse(null, { status: 204 });
}
