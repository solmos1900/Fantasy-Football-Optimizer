"use client";

import { useMemo, useState } from "react";
import { BrandWordmark } from "@/components/brand";
import { ChatComposer } from "@/components/chat/chat-composer";
import { MessageList } from "@/components/chat/message-list";
import { TemplateButtons } from "@/components/chat/template-buttons";
import { TemplateCard } from "@/components/chat/template-cards";
import { ChatToolResultView } from "@/components/chat/tool-result-cards";
import { PendingLink } from "@/components/pending-link";
import type { UIMessage } from "ai";
import type { ChatPlayerMetricCard } from "@/lib/chat/tool-runners";

/**
 * Auth-free preview for chat screenshot / QA states.
 * Enable with NODE_ENV=development or NEXT_PUBLIC_ALLOW_UI_PREVIEW=1.
 */
type PreviewState =
  | "empty"
  | "mention"
  | "trade"
  | "who-to-start"
  | "connect-unlock";

const mockCard = (
  partial: Partial<ChatPlayerMetricCard> &
    Pick<ChatPlayerMetricCard, "espnId" | "label" | "position">,
): ChatPlayerMetricCard => ({
  injuryStatus: "ACTIVE",
  injuryLabel: null,
  seasonPpg: 16.2,
  last3Avg: 18.1,
  sleeperProj: 15.4,
  byeThisWeek: false,
  opponent: "@SEA",
  formLine: "Last 3 games avg 18.1 vs season 16.2: trending up",
  spark: [
    { week: 1, points: 12 },
    { week: 2, points: 18 },
    { week: 3, points: 15 },
    { week: 4, points: 19 },
  ],
  ...partial,
});

export default function ChatPreviewPage() {
  const allowed =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_ALLOW_UI_PREVIEW === "1";
  const [state, setState] = useState<PreviewState>("empty");

  const tradeMessages = useMemo((): UIMessage[] => {
    return [
      {
        id: "u1",
        role: "user",
        parts: [
          {
            type: "text",
            text: "Trade: LEFT Puka Nacua (LAR) + Kyren Williams (LAR) for RIGHT Ja'Marr Chase (CIN) + Chase Brown (CIN)",
          },
        ],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Side B is ahead on chip value — Side A would usually want something else back.",
          },
          {
            type: "tool-analyze_trade",
            toolCallId: "t1",
            state: "output-available",
            input: {},
            output: {
              ok: true,
              kind: "trade",
              headline:
                "Lopsided: Side B gets 4.2 more points of value; Side A shouldn't accept.",
              differenceLabel: "+4.2 for Side B",
              winner: "b",
              giveValue: 28.1,
              receiveValue: 32.3,
              valueGap: 4.2,
              verdictLabel: "Lean reject",
              sideA: [
                mockCard({
                  espnId: 1,
                  label: "Puka Nacua (LAR)",
                  position: "WR",
                }),
                mockCard({
                  espnId: 2,
                  label: "Kyren Williams (LAR)",
                  position: "RB",
                  seasonPpg: 14.8,
                  last3Avg: 13.2,
                }),
              ],
              sideB: [
                mockCard({
                  espnId: 3,
                  label: "Ja'Marr Chase (CIN)",
                  position: "WR",
                  seasonPpg: 18.4,
                  last3Avg: 20.1,
                }),
                mockCard({
                  espnId: 4,
                  label: "Chase Brown (CIN)",
                  position: "RB",
                  seasonPpg: 13.5,
                  last3Avg: 15.0,
                }),
              ],
              freshness: {
                label: "Stats through Week 4 · updated 6 min ago",
                warning: null,
              },
              facts: [],
            },
          },
        ],
      },
    ];
  }, []);

  const wtsMessages = useMemo((): UIMessage[] => {
    return [
      {
        id: "u2",
        role: "user",
        parts: [
          {
            type: "text",
            text: "Who to Start: Amon-Ra St. Brown (DET) vs DK Metcalf (PIT)",
          },
        ],
      },
      {
        id: "a2",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Start Amon-Ra St. Brown (DET) — clearer projection edge this week.",
          },
          {
            type: "tool-compare_who_to_start",
            toolCallId: "t2",
            state: "output-available",
            input: {},
            output: {
              ok: true,
              kind: "who-to-start",
              headline: "START Amon-Ra St. Brown (DET)",
              verdictLabel: "START A",
              edge: 3.2,
              players: [
                mockCard({
                  espnId: 10,
                  label: "Amon-Ra St. Brown (DET)",
                  position: "WR",
                  sleeperProj: 17.8,
                }),
                mockCard({
                  espnId: 11,
                  label: "DK Metcalf (PIT)",
                  position: "WR",
                  sleeperProj: 14.6,
                  seasonPpg: 13.1,
                  last3Avg: 12.4,
                }),
              ],
              reasons: [
                "Projected 17.8 vs 14.6 this week (Sleeper full PPR).",
                "Amon-Ra St. Brown (DET) holds the stronger recent form.",
              ],
              freshness: {
                label: "Stats through Week 4 · updated 6 min ago",
                warning: null,
              },
            },
          },
        ],
      },
    ];
  }, []);

  if (!allowed) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-emerald-950/60">Preview disabled.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-3 py-6 sm:px-4">
      <p className="type-eyebrow text-orange-700">UI preview · chat</p>
      <h1 className="type-page text-emerald-950">Chat home states</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            ["empty", "Empty home"],
            ["mention", "@ mention"],
            ["trade", "Trade answer"],
            ["who-to-start", "Who to Start"],
            ["connect-unlock", "Connect unlock"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            data-testid={`preview-${id}`}
            onClick={() => setState(id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              state === id
                ? "border-orange-500/50 bg-orange-600/20 text-emerald-950"
                : "border-emerald-950/15 text-emerald-950/70"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-emerald-950/12 bg-[color-mix(in_srgb,var(--background)_40%,transparent)]">
        <div className="min-h-[70vh] px-3 py-4 sm:px-4">
          {state === "empty" ? (
            <div className="mx-auto flex max-w-lg flex-col items-center gap-6 py-10 text-center">
              <BrandWordmark markSize={40} className="justify-center" />
              <div>
                <p className="text-lg font-semibold text-emerald-950">
                  Your fantasy edge, in one chat
                </p>
                <p className="mt-2 text-sm text-emerald-950/60">
                  Ask in plain English or tap a template.
                </p>
              </div>
              <TemplateButtons onPick={() => undefined} />
            </div>
          ) : null}

          {state === "mention" ? (
            <div className="relative mx-auto max-w-xl pt-24">
              <div className="absolute bottom-full left-0 right-0 mb-2 max-h-56 overflow-auto rounded-xl border border-emerald-950/15 bg-[var(--surface)] shadow-lg">
                {[
                  { label: "Puka Nacua (LAR)", pos: "WR" },
                  { label: "Puka Nacua Jr. (demo)", pos: "WR" },
                ].map((h, i) => (
                  <div
                    key={h.label}
                    className={`flex items-center justify-between px-3 py-2.5 text-sm ${
                      i === 0 ? "bg-orange-600/20" : ""
                    }`}
                  >
                    <span className="font-medium">{h.label}</span>
                    <span className="type-caption text-emerald-950/45">
                      {h.pos}
                    </span>
                  </div>
                ))}
              </div>
              <ChatComposer
                onSend={() => undefined}
                placeholder="Who should I start @puka"
              />
              <p className="mt-2 text-center type-caption text-emerald-950/45">
                Composer with @ typeahead open (preview mock)
              </p>
            </div>
          ) : null}

          {state === "trade" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-orange-500/25 bg-[color-mix(in_srgb,var(--kraft)_80%,transparent)] p-3 sm:p-4">
                <p className="text-sm font-semibold text-emerald-950">Trade</p>
                <p className="type-caption text-emerald-950/50">
                  Add players on each side, then Run.
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="type-eyebrow text-orange-700">Left</p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-md border border-orange-500/35 bg-orange-600/15 px-2 py-1 text-xs font-semibold">
                        Puka Nacua (LAR)
                      </span>
                      <span className="rounded-md border border-orange-500/35 bg-orange-600/15 px-2 py-1 text-xs font-semibold">
                        Kyren Williams (LAR)
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="type-eyebrow text-orange-700">Right</p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-md border border-orange-500/35 bg-orange-600/15 px-2 py-1 text-xs font-semibold">
                        Ja&apos;Marr Chase (CIN)
                      </span>
                      <span className="rounded-md border border-orange-500/35 bg-orange-600/15 px-2 py-1 text-xs font-semibold">
                        Chase Brown (CIN)
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <span className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white">
                    Run
                  </span>
                </div>
              </div>
              <MessageList messages={tradeMessages} />
            </div>
          ) : null}

          {state === "who-to-start" ? (
            <MessageList messages={wtsMessages} />
          ) : null}

          {state === "connect-unlock" ? (
            <div className="mx-auto max-w-md space-y-4 py-8">
              <div className="rounded-lg border border-orange-500/25 bg-orange-50/30 px-3 py-2 text-sm">
                General NFL questions work now.{" "}
                <PendingLink
                  href="/connect#espn"
                  className="font-semibold text-orange-700"
                >
                  Connect a league to unlock
                </PendingLink>{" "}
                roster and league answers.
              </div>
              <ChatToolResultView
                output={{
                  ok: false,
                  kind: "league-gate",
                  message: "Connect a league to unlock your roster.",
                  connectHref: "/connect#espn",
                }}
              />
            </div>
          ) : null}
        </div>
        {state === "empty" || state === "mention" ? (
          <div className="border-t border-emerald-950/10 px-3 py-3 sm:px-4">
            {state === "empty" ? (
              <ChatComposer onSend={() => undefined} />
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
