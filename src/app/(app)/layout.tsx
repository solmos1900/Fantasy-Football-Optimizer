import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      <AppNav />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-16">
        {children}
      </div>
    </div>
  );
}
