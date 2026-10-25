import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/http/api-guard";
import {
  ACCOUNT_DELETE_CONFIRMATION,
  deleteUserAccount,
  isDeleteConfirmed,
} from "@/lib/account/delete";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ confirm: z.string().max(32) });

/**
 * Permanently delete the signed-in user and their data. The client signs out
 * right after a successful response (the JWT itself cannot be revoked).
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, {
    bucket: "account-delete",
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (limited) return limited;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || !isDeleteConfirmed(parsed.data.confirm)) {
    return NextResponse.json(
      { error: `Type ${ACCOUNT_DELETE_CONFIRMATION} to confirm.` },
      { status: 400 },
    );
  }

  try {
    const deleted = await deleteUserAccount(userId);
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    console.error("[account/delete] failed", err);
    return NextResponse.json(
      { error: "Could not delete your account. Please try again." },
      { status: 500 },
    );
  }
}
