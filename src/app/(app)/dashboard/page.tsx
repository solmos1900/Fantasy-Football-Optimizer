import { auth } from "@/lib/auth";
import { getUserLeagueConnection } from "@/lib/league/service";
import { ChatHome } from "@/components/chat/chat-home";
import { ChatOffline } from "@/components/chat/chat-offline";
import { chatAvailable } from "@/lib/chat/config";

/**
 * Landing screen after sign-in / guest entry — fantasy AI chat home.
 * Existing tools remain reachable via bottom nav + in-chat links. When chat is
 * switched off (CHAT_DISABLED / no gateway), Home shows the tools instead.
 */
export default async function DashboardPage() {
  const session = await auth();
  const connection = session?.user?.id
    ? await getUserLeagueConnection(session.user.id)
    : null;

  if (!chatAvailable()) {
    return (
      <ChatOffline userName={session?.user?.name} hasLeague={Boolean(connection)} />
    );
  }

  return (
    <ChatHome
      isGuest={Boolean(session?.user?.isGuest)}
      hasLeague={Boolean(connection)}
      userName={session?.user?.name}
    />
  );
}
