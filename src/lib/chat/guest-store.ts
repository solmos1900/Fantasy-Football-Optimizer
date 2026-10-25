/**
 * Guest (and fallback) chat persistence in the browser.
 * Never stores another user's league data — only this session's messages.
 */

import type { UIMessage } from "ai";

const LIST_KEY = "giq-chat-conversations";
const MSG_PREFIX = "giq-chat-msgs:";

export type GuestConversationMeta = {
  id: string;
  title: string;
  updatedAt: string;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function listGuestConversations(): GuestConversationMeta[] {
  if (typeof window === "undefined") return [];
  const list = safeParse<GuestConversationMeta[]>(
    localStorage.getItem(LIST_KEY),
    [],
  );
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadGuestMessages(id: string): UIMessage[] {
  if (typeof window === "undefined") return [];
  return safeParse<UIMessage[]>(localStorage.getItem(MSG_PREFIX + id), []);
}

export function saveGuestConversation(
  id: string,
  title: string,
  messages: UIMessage[],
) {
  if (typeof window === "undefined") return;
  const list = listGuestConversations().filter((c) => c.id !== id);
  list.unshift({ id, title, updatedAt: new Date().toISOString() });
  localStorage.setItem(LIST_KEY, JSON.stringify(list.slice(0, 30)));
  localStorage.setItem(MSG_PREFIX + id, JSON.stringify(messages.slice(-80)));
}

export function deleteGuestConversation(id: string) {
  if (typeof window === "undefined") return;
  const list = listGuestConversations().filter((c) => c.id !== id);
  localStorage.setItem(LIST_KEY, JSON.stringify(list));
  localStorage.removeItem(MSG_PREFIX + id);
}

export function newGuestConversationId(): string {
  return `guest-${crypto.randomUUID()}`;
}
