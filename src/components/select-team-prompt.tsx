import { PendingLink } from "@/components/pending-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  title?: string;
  className?: string;
};

/**
 * League is connected but no teamId is set — refuse to invent "your" roster.
 */
export function SelectTeamPrompt({
  title = "Pick your team",
  className,
}: Props) {
  return (
    <div className={cn("max-w-xl", className)}>
      <h1 className="type-page text-emerald-950">{title}</h1>
      <p className="type-body mt-2 text-emerald-950/65">
        Your league is connected, but we do not know which team is yours yet.
        Enter your team ID on the connect page so we show the right roster —
        not someone else&apos;s.
      </p>
      <div className="mt-6">
        <PendingLink
          href="/connect#espn"
          className={buttonVariants({ variant: "primary" })}
        >
          Choose your team
        </PendingLink>
      </div>
    </div>
  );
}
