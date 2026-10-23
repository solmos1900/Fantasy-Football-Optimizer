/**
 * Chat conversation persistence for signed-in (non-guest) users.
 * Guests keep threads in sessionStorage / localStorage on the client.
 */

import { prisma } from "@/lib/db";

export type StoredChatMessage = {
  id: string;
  role: string;
  content: string;
  partsJson: string | null;
  createdAt: string;
};

export type StoredConversation = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
};

export async function listConversations(
  userId: string,
): Promise<StoredConversation[]> {
  const rows = await prisma.chatConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: { id: true, title: true, updatedAt: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updatedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getConversationForUser(
  userId: string,
  conversationId: string,
) {
  return prisma.chatConversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
    },
  });
}

export async function createConversation(
  userId: string,
  title = "New chat",
): Promise<StoredConversation> {
  const row = await prisma.chatConversation.create({
    data: { userId, title },
  });
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function deleteConversation(userId: string, conversationId: string) {
  const existing = await prisma.chatConversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  });
  if (!existing) return false;
  await prisma.chatConversation.delete({ where: { id: existing.id } });
  return true;
}

export async function appendMessages(options: {
  userId: string;
  conversationId: string;
  titleFromUserText?: string;
  messages: {
    role: string;
    content: string;
    partsJson?: string | null;
  }[];
}) {
  const convo = await prisma.chatConversation.findFirst({
    where: { id: options.conversationId, userId: options.userId },
    select: { id: true, title: true },
  });
  if (!convo) return null;

  const titleUpdate =
    convo.title === "New chat" && options.titleFromUserText
      ? options.titleFromUserText.slice(0, 72)
      : undefined;

  await prisma.$transaction([
    prisma.chatMessage.createMany({
      data: options.messages.map((m) => ({
        conversationId: convo.id,
        role: m.role,
        content: m.content,
        partsJson: m.partsJson ?? null,
      })),
    }),
    prisma.chatConversation.update({
      where: { id: convo.id },
      data: {
        updatedAt: new Date(),
        ...(titleUpdate ? { title: titleUpdate } : {}),
      },
    }),
  ]);
  return convo.id;
}

export function messagesToClient(
  messages: {
    id: string;
    role: string;
    content: string;
    partsJson: string | null;
    createdAt: Date;
  }[],
): StoredChatMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    partsJson: m.partsJson,
    createdAt: m.createdAt.toISOString(),
  }));
}
