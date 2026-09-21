import { NextResponse } from "next/server";

/**
 * Auth.js v5 with JWT sessions does not require a separate middleware matcher
 * for every page — protected routes check `auth()` in the (app) layout.
 * This route keeps a simple health check for local smoke tests.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: process.env.NEXT_PUBLIC_APP_NAME ?? "Gridiron IQ",
    time: new Date().toISOString(),
  });
}
