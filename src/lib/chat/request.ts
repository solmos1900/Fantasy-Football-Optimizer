import { z } from "zod";
import { chatTemplatePayloadSchema } from "@/lib/chat/templates";

export const chatRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1).max(80),
  conversationId: z.string().cuid().optional().nullable(),
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
