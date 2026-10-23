/**
 * Quick-start chat templates — easy to extend: add an entry + zod payload.
 * Structured cards collect player ids; Run sends a typed payload to /api/chat.
 */

import { z } from "zod";

export const chatTemplateIds = [
  "trade",
  "who-to-start",
  "waiver",
  "outlook",
] as const;

export type ChatTemplateId = (typeof chatTemplateIds)[number];

export type ChatTemplateDef = {
  id: ChatTemplateId;
  label: string;
  /** Short hint under the button. */
  hint: string;
  /** Placeholder shown when the card opens. */
  promptHint: string;
};

/** Registry — append new templates here; UI maps id → card component. */
export const CHAT_TEMPLATES: ChatTemplateDef[] = [
  {
    id: "trade",
    label: "Trade",
    hint: "Grade both sides",
    promptHint: "Add players on each side, then Run.",
  },
  {
    id: "who-to-start",
    label: "Who to Start",
    hint: "Pick 2+",
    promptHint: "Add two or more players to compare.",
  },
  {
    id: "waiver",
    label: "Waiver / Pickup",
    hint: "Worth a claim?",
    promptHint: "Mention a free-agent target to evaluate.",
  },
  {
    id: "outlook",
    label: "Player outlook",
    hint: "Form + proj",
    promptHint: "Mention a player for season form and this-week outlook.",
  },
];

export const mentionRefSchema = z.object({
  espnId: z.number().int().positive(),
  name: z.string().min(1).max(80),
  nflTeam: z.string().max(8).nullable().optional(),
  position: z.string().max(8).optional(),
});

export type MentionRef = z.infer<typeof mentionRefSchema>;

export const tradeTemplatePayloadSchema = z.object({
  type: z.literal("trade"),
  left: z.array(mentionRefSchema).min(1).max(8),
  right: z.array(mentionRefSchema).min(1).max(8),
});

export const whoToStartTemplatePayloadSchema = z.object({
  type: z.literal("who-to-start"),
  players: z.array(mentionRefSchema).min(2).max(6),
});

export const waiverTemplatePayloadSchema = z.object({
  type: z.literal("waiver"),
  player: mentionRefSchema,
});

export const outlookTemplatePayloadSchema = z.object({
  type: z.literal("outlook"),
  player: mentionRefSchema,
});

export const chatTemplatePayloadSchema = z.discriminatedUnion("type", [
  tradeTemplatePayloadSchema,
  whoToStartTemplatePayloadSchema,
  waiverTemplatePayloadSchema,
  outlookTemplatePayloadSchema,
]);

export type ChatTemplatePayload = z.infer<typeof chatTemplatePayloadSchema>;

export function templateUserText(payload: ChatTemplatePayload): string {
  const fmt = (p: MentionRef) =>
    p.nflTeam ? `${p.name} (${p.nflTeam})` : p.name;
  switch (payload.type) {
    case "trade":
      return `Trade: LEFT ${payload.left.map(fmt).join(" + ")} for RIGHT ${payload.right.map(fmt).join(" + ")}`;
    case "who-to-start":
      return `Who to Start: ${payload.players.map(fmt).join(" vs ")}`;
    case "waiver":
      return `Waiver / pickup outlook for ${fmt(payload.player)}`;
    case "outlook":
      return `Player outlook for ${fmt(payload.player)}`;
  }
}

export function getTemplateDef(id: ChatTemplateId): ChatTemplateDef {
  const found = CHAT_TEMPLATES.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown template: ${id}`);
  return found;
}
