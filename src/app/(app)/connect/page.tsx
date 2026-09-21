import { ConnectLeagueForm } from "@/components/connect-league-form";

export default function ConnectPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl uppercase tracking-wide text-emerald-950">
          Connect league
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-emerald-950/65">
          Start with demo data, or sync a real ESPN Fantasy Football league. Private
          leagues require SWID and espn_s2 cookies — see the README for how to copy them.
        </p>
      </div>
      <ConnectLeagueForm />
    </div>
  );
}
