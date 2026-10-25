import { auth } from "@/lib/auth";
import { getUserLeagueConnection } from "@/lib/league/service";
import { ChatHome } from "@/components/chat/chat-home";

/**
 * Landing screen after sign-in / guest entry — fantasy AI chat home.
 * Existing tools remain reachable via bottom nav + in-chat links.
 */
export default async function DashboardPage() {
  const session = await auth();
  const connection = session?.user?.id
    ? await getUserLeagueConnection(session.user.id)
    : null;

  return (
    <ChatHome
      isGuest={Boolean(session?.user?.isGuest)}
      hasLeague={Boolean(connection)}
      userName={session?.user?.name}
    />
  );
}
