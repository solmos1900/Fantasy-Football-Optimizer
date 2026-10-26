import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy · Gridiron IQ",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains what Gridiron IQ (&ldquo;we&rdquo;) stores when
        you use the app, why, who else processes it, and how to delete it. We do
        not sell your data and we do not show ads.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your name and email. For
          email/password accounts we store a one-way (bcrypt) hash of your
          password, never the password itself. For Google or GitHub sign-in we
          store the account link that provider returns.
        </li>
        <li>
          <strong>Guest sessions:</strong> the display name you enter. Guests
          get a temporary account with no email.
        </li>
        <li>
          <strong>Connected leagues:</strong> your ESPN or Sleeper league ID
          (and Sleeper user ID), season, team,
          and a saved copy of the league data ESPN or Sleeper returns (rosters, team and
          manager names, scores, matchups). For private leagues we store the
          ESPN <code>SWID</code> and <code>espn_s2</code> cookies you paste,
          encrypted at rest (AES-256-GCM), and use them only to read your league
          from ESPN.
        </li>
        <li>
          <strong>AI chat:</strong> for signed-in users we store your chat
          threads so you can reopen them. Guest chats stay in your browser. For
          every chat turn we record how many AI tokens were used, for cost
          control.
        </li>
        <li>
          <strong>Security and abuse prevention:</strong> we count requests per
          IP address and per email to limit sign-in attempts and chat usage.
          IPs and emails are stored only as salted one-way hashes in these
          counters. Email verification codes are stored hashed.
        </li>
      </ul>

      <h2>Who processes data for us</h2>
      <ul>
        <li>Vercel: app hosting and the AI Gateway that routes chat requests.</li>
        <li>
          The AI model provider behind the gateway (currently Google Gemini):
          receives your chat messages and the player data our tools return, to
          generate a reply.
        </li>
        <li>Our database host (PostgreSQL): stores the data described above.</li>
        <li>Resend: delivers verification emails to your address.</li>
        <li>
          Cloudflare Turnstile (when enabled): checks that sign-ups and guest
          sessions come from a person.
        </li>
        <li>
          ESPN: receives your league ID and, for private leagues, your ESPN
          cookies when we sync your league.
        </li>
        <li>
          Sleeper: receives your Sleeper username and league ID when you
          connect or sync a Sleeper league (no password or cookies).
        </li>
        <li>
          DynastyProcess (public player-ID file on GitHub): downloaded to match
          Sleeper players to our stats. No data about you is sent.
        </li>
      </ul>
      <p>
        Public NFL data comes from ESPN, Sleeper, and nflverse (CC BY 4.0). We
        send them no personal data apart from the league requests above (your
        Sleeper username and league ID go to Sleeper when you connect a
        Sleeper league).
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          Guest accounts and their leagues are deleted when you sign out, or
          automatically within 24 hours.
        </li>
        <li>
          Request counters are deleted after 2–7 days.
        </li>
        <li>
          Account, league, and chat data are kept until you delete your account.
          Token-usage records are kept for cost accounting but are detached from
          you when you delete your account.
        </li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>
          Delete your account at any time from <strong>Account</strong> in the
          app. This removes your account, connected leagues (including saved
          ESPN cookies), and saved chats.
        </li>
        <li>Disconnect a league by deleting your account or reconnecting a different one.</li>
        <li>
          Your browser may keep small preferences (for example, whether you
          dismissed a guide) in local storage; clear site data to remove them.
        </li>
      </ul>
    </LegalPage>
  );
}
