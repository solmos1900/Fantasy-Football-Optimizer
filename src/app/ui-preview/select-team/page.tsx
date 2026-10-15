import { SelectTeamPrompt } from "@/components/select-team-prompt";

/** Design preview for the no-team-selected empty state (issue #45). */
export default function SelectTeamPreviewPage() {
  return (
    <main className="min-h-screen bg-[var(--kraft,#f3efe6)] px-6 py-16">
      <SelectTeamPrompt title="Pick your team" />
    </main>
  );
}
