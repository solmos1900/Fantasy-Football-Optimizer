"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlayerPicker } from "@/components/chat/player-picker";
import {
  type ChatTemplateId,
  type ChatTemplatePayload,
  type MentionRef,
  getTemplateDef,
} from "@/lib/chat/templates";

type Props = {
  templateId: ChatTemplateId;
  onCancel: () => void;
  onRun: (payload: ChatTemplatePayload) => void;
};

export function TemplateCard({ templateId, onCancel, onRun }: Props) {
  const def = getTemplateDef(templateId);

  if (templateId === "trade") {
    return <TradeTemplateCard hint={def.promptHint} onCancel={onCancel} onRun={onRun} />;
  }
  if (templateId === "who-to-start") {
    return (
      <WhoToStartTemplateCard
        hint={def.promptHint}
        onCancel={onCancel}
        onRun={onRun}
      />
    );
  }
  if (templateId === "waiver" || templateId === "outlook") {
    return (
      <SinglePlayerTemplateCard
        type={templateId}
        hint={def.promptHint}
        onCancel={onCancel}
        onRun={onRun}
      />
    );
  }
  return null;
}

function TradeTemplateCard({
  hint,
  onCancel,
  onRun,
}: {
  hint: string;
  onCancel: () => void;
  onRun: (payload: ChatTemplatePayload) => void;
}) {
  const [left, setLeft] = useState<MentionRef[]>([]);
  const [right, setRight] = useState<MentionRef[]>([]);
  const ready = left.length >= 1 && right.length >= 1;

  return (
    <div className="animate-fade-up rounded-xl border border-orange-500/25 bg-[color-mix(in_srgb,var(--kraft)_80%,transparent)] p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-emerald-950">Trade</p>
          <p className="type-caption text-emerald-950/50">{hint}</p>
        </div>
        <button
          type="button"
          className="text-xs text-emerald-950/50 hover:text-emerald-950"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <PlayerPicker label="Left" players={left} onChange={setLeft} />
        <PlayerPicker label="Right" players={right} onChange={setRight} />
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          variant="primary"
          disabled={!ready}
          onClick={() => onRun({ type: "trade", left, right })}
        >
          Run
        </Button>
      </div>
    </div>
  );
}

function WhoToStartTemplateCard({
  hint,
  onCancel,
  onRun,
}: {
  hint: string;
  onCancel: () => void;
  onRun: (payload: ChatTemplatePayload) => void;
}) {
  const [players, setPlayers] = useState<MentionRef[]>([]);
  const ready = players.length >= 2;

  return (
    <div className="animate-fade-up rounded-xl border border-orange-500/25 bg-[color-mix(in_srgb,var(--kraft)_80%,transparent)] p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-emerald-950">Who to Start</p>
          <p className="type-caption text-emerald-950/50">{hint}</p>
        </div>
        <button
          type="button"
          className="text-xs text-emerald-950/50 hover:text-emerald-950"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      <div className="mt-3">
        <PlayerPicker
          label="Players"
          players={players}
          onChange={setPlayers}
          max={6}
        />
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          variant="primary"
          disabled={!ready}
          onClick={() => onRun({ type: "who-to-start", players })}
        >
          Run
        </Button>
      </div>
    </div>
  );
}

function SinglePlayerTemplateCard({
  type,
  hint,
  onCancel,
  onRun,
}: {
  type: "waiver" | "outlook";
  hint: string;
  onCancel: () => void;
  onRun: (payload: ChatTemplatePayload) => void;
}) {
  const [players, setPlayers] = useState<MentionRef[]>([]);
  const ready = players.length === 1;
  const title = type === "waiver" ? "Waiver / Pickup" : "Player outlook";

  return (
    <div className="animate-fade-up rounded-xl border border-orange-500/25 bg-[color-mix(in_srgb,var(--kraft)_80%,transparent)] p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-emerald-950">{title}</p>
          <p className="type-caption text-emerald-950/50">{hint}</p>
        </div>
        <button
          type="button"
          className="text-xs text-emerald-950/50 hover:text-emerald-950"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      <div className="mt-3">
        <PlayerPicker
          label="Player"
          players={players}
          onChange={(next) => setPlayers(next.slice(-1))}
          max={1}
        />
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          variant="primary"
          disabled={!ready || !players[0]}
          onClick={() => {
            if (!players[0]) return;
            onRun(
              type === "waiver"
                ? { type: "waiver", player: players[0] }
                : { type: "outlook", player: players[0] },
            );
          }}
        >
          Run
        </Button>
      </div>
    </div>
  );
}
