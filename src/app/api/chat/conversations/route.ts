import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  createConversation,
  listConversations,
} from "@/lib/chat/persistence";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.isGuest) {
    // Guests persist locally — empty server list.
    return NextResponse.json({ conversations: [], localOnly: true });
  }
  const conversations = await listConversations(session.user.id);
  return NextResponse.json({ conversations, localOnly: false });
}

const postSchema = z.object({
  title: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.isGuest) {
    return NextResponse.json({
      conversation: null,
      localOnly: true,
    });
  }
  const body = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const conversation = await createConversation(
    session.user.id,
    body.data.title ?? "New chat",
  );
  return NextResponse.json({ conversation, localOnly: false });
}
