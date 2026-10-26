/**
 * How-to-connect onboarding copy. ESPN and Sleeper connect exist in the
 * product; other hosts get one honest "coming soon" line.
 */

export type ConnectGuideOption = {
  id: "sleeper" | "espn";
  label: string;
  body: string;
  href: string;
};

/** The two connect paths, easiest first, for the first-run modal. */
export const CONNECT_GUIDE_OPTIONS: ConnectGuideOption[] = [
  {
    id: "sleeper",
    label: "Sleeper",
    body: "Just your Sleeper username — we find your leagues and your team. About 30 seconds, works on your phone.",
    href: "/connect#sleeper",
  },
  {
    id: "espn",
    label: "ESPN",
    body: "Your League ID from the league's web address. Private leagues also need two cookies from a computer browser — we show you where.",
    href: "/connect#espn",
  },
];

export const COMING_SOON_PLATFORMS_NOTE =
  "Yahoo: Coming soon. ESPN and Sleeper leagues work today.";

/** Connect-form field labels the cookie help refers to. */
export const ESPN_COOKIE_FIELD_LABELS = [
  "SWID (private)",
  "espn_s2 (private)",
] as const;

/**
 * Detailed "where do I find SWID / espn_s2" steps, shown on /connect next to
 * those fields (not in the first-run modal).
 */
export const ESPN_COOKIE_HELP: { browser: string; steps: string[] }[] = [
  {
    browser: "Chrome or Edge (computer)",
    steps: [
      "Sign in at fantasy.espn.com and open your league.",
      "Open developer tools: Ctrl+Shift+I (Windows) or Cmd+Option+I (Mac).",
      "Go to Application → Storage → Cookies → https://fantasy.espn.com.",
      "Copy the SWID value (including the { } braces) and the espn_s2 value exactly as shown.",
    ],
  },
  {
    browser: "Safari (Mac)",
    steps: [
      "Turn on the developer menu: Safari → Settings → Advanced → Show features for web developers.",
      "Sign in at fantasy.espn.com and open your league.",
      "Develop → Show Web Inspector → Storage → Cookies → fantasy.espn.com.",
      "Copy SWID (including the braces) and espn_s2 (keep its URL encoding).",
    ],
  },
];

/**
 * Optional walkthrough recording. Only shown when this env var is set, so
 * the modal never probes for (and 404s on) a file that does not exist.
 */
export function espnWalkthroughVideoUrl(): string | null {
  return process.env.NEXT_PUBLIC_ONBOARDING_ESPN_VIDEO_URL?.trim() || null;
}
