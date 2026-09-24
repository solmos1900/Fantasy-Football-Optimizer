import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { getUserLeagueConnection } from "@/lib/league/service";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const connection = session.user.id
    ? await getUserLeagueConnection(session.user.id)
    : null;

  const league = connection
    ? {
        name: connection.leagueName,
        isDemo: connection.isDemo,
      }
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      <AppNav league={league} />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-[calc(5.5rem+max(0.75rem,env(safe-area-inset-bottom,0px)))]">
        {children}
      </div>
    </div>
  );
}
