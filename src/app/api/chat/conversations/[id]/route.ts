import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  deleteConversation,
  getConversationForUser,
  messagesToClient,
} from "@/lib/chat/persistence";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || session.user.isGuest) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const convo = await getConversationForUser(session.user.id, id);
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    conversation: {
      id: convo.id,
      title: convo.title,
      updatedAt: convo.updatedAt.toISOString(),
      createdAt: convo.createdAt.toISOString(),
    },
    messages: messagesToClient(convo.messages),
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || session.user.isGuest) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const ok = await deleteConversation(session.user.id, id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
