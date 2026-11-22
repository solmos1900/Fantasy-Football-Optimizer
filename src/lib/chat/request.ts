import { z } from "zod";
import { chatTemplatePayloadSchema } from "@/lib/chat/templates";

/** Matches newGuestConversationId() in src/lib/chat/guest-store.ts. */
export const GUEST_CONVERSATION_ID_RE =
  /^guest-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const chatRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1).max(80),
  /**
   * Signed-in: a ChatConversation id (cuid). Guests: the browser-local id from
   * newGuestConversationId() ("guest-<uuid>"); guest chats are never stored.
   */
  conversationId: z
    .union([z.string().cuid(), z.string().regex(GUEST_CONVERSATION_ID_RE)])
    .optional()
    .nullable(),
  templatePayload: chatTemplatePayloadSchema.optional().nullable(),
  /** ESPN ids already resolved by the client from @ chips / templates. */
  mentionEspnIds: z.array(z.number().int().positive()).max(24).optional(),
  id: z.string().optional(),
});

export type ChatRequestBody = z.infer<typeof chatRequestSchema>;

export function clientIpFromHeaders(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || null;
  return headers.get("x-real-ip");
}
