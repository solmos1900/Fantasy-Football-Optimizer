/**
 * How-to-connect onboarding copy. Only ESPN connect exists in the product
 * today, so only ESPN gets real steps; other hosts get one honest line.
 */

export type ConnectGuideStep = {
  id: string;
  title: string;
  body: string;
};

/** The three things a user does on /connect — kept short for the modal. */
export const ESPN_CONNECT_STEPS: ConnectGuideStep[] = [
  {
    id: "espn-league-id",
    title: "Find your League ID",
    body: "Open your league on fantasy.espn.com. It's the number after leagueId= in the address bar.",
  },
  {
    id: "espn-private",
    title: "Private league? Add two cookies",
    body: "Public leagues skip this. Private leagues also need two values from a computer browser — the Connect page shows exactly where to find them.",
  },
  {
    id: "espn-save",
    title: "Connect & save",
    body: "We load your rosters and stats. Tap Sync league any time to refresh.",
  },
];

export const COMING_SOON_PLATFORMS_NOTE =
  "Sleeper and Yahoo: Coming soon. ESPN is the only league you can connect today.";

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
