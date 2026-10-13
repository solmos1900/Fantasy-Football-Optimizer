/**
 * How-to-connect onboarding — only platforms that exist in the product today
 * get real steps. Others are honest "Coming soon" slots (no fake steps).
 */

export type OnboardingPlatformId = "espn" | "sleeper" | "other";

export type OnboardingStep = {
  id: string;
  title: string;
  body: string;
  /** Exact in-app field labels when the step maps to the Connect form. */
  fieldLabels?: string[];
};

export type OnboardingPlatform = {
  id: OnboardingPlatformId;
  label: string;
  /** False when connect is not implemented in code yet. */
  available: boolean;
  summary: string;
  /** Public path or override via NEXT_PUBLIC_ONBOARDING_*_VIDEO_URL. */
  defaultVideoPath: string;
  videoEnvKey: string;
  steps: OnboardingStep[];
  comingSoonNote?: string;
};

/** Default asset paths — drop recordings here (see PR shot list). */
export const ONBOARDING_VIDEO_PATHS = {
  espn: "/onboarding/espn-safari.mp4",
  sleeper: "/onboarding/sleeper-safari.mp4",
  other: "/onboarding/other-safari.mp4",
} as const;

export const ONBOARDING_PLATFORMS: OnboardingPlatform[] = [
  {
    id: "espn",
    label: "ESPN",
    available: true,
    summary:
      "Connect a public or private ESPN fantasy league. Private leagues need two cookies copied from Safari on a computer.",
    defaultVideoPath: ONBOARDING_VIDEO_PATHS.espn,
    videoEnvKey: "NEXT_PUBLIC_ONBOARDING_ESPN_VIDEO_URL",
    steps: [
      {
        id: "espn-open",
        title: "Open Connect ESPN league",
        body: "After you sign in or continue as a guest, open Connect (or Home → Connect ESPN league) to link your fantasy league.",
      },
      {
        id: "espn-league-id",
        title: "Enter League ID",
        body: "Type your ESPN League ID. You can find it in the ESPN fantasy URL for your league (the long number).",
        fieldLabels: ["League ID"],
      },
      {
        id: "espn-season-team",
        title: "Season and your team",
        body: "Set Season to the current fantasy year. Your team ID is optional — add it if you know which ESPN team number is yours.",
        fieldLabels: ["Season", "Your team ID"],
      },
      {
        id: "espn-cookies",
        title: "Private leagues: SWID and espn_s2",
        body: "Public leagues can skip this. For a private league, on a computer open Safari → go to fantasy.espn.com while signed in → Developer menu or Web Inspector → Storage → Cookies → https://fantasy.espn.com. Copy SWID (includes the braces) and espn_s2 (keep the URL encoding). Paste them into the matching fields. Treat them like passwords.",
        fieldLabels: ["SWID (private)", "espn_s2 (private)"],
      },
      {
        id: "espn-save",
        title: "Connect & save",
        body: "Tap Connect & save. Gridiron IQ stores the link on this account (cookies encrypted at rest) and loads your rosters and latest finished-week stats. Use Sync league anytime to refresh without retyping the League ID.",
      },
    ],
  },
  {
    id: "sleeper",
    label: "Sleeper",
    available: false,
    summary: "Sleeper league connect is not in the app yet.",
    defaultVideoPath: ONBOARDING_VIDEO_PATHS.sleeper,
    videoEnvKey: "NEXT_PUBLIC_ONBOARDING_SLEEPER_VIDEO_URL",
    steps: [],
    comingSoonNote:
      "Coming soon — there is no Sleeper connect flow in Gridiron IQ today. When it ships, this guide will walk through the real steps.",
  },
  {
    id: "other",
    label: "Other",
    available: false,
    summary: "Other fantasy hosts are not connected yet.",
    defaultVideoPath: ONBOARDING_VIDEO_PATHS.other,
    videoEnvKey: "NEXT_PUBLIC_ONBOARDING_OTHER_VIDEO_URL",
    steps: [],
    comingSoonNote:
      "Coming soon — Yahoo and other hosts are not available to connect in the app yet. ESPN is the only live connect path today.",
  },
];
