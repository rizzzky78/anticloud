import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { JobsProvider } from "@/components/jobs-context";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentUser();
  if (!session) redirect("/sign-in");

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <JobsProvider>
        <AppSidebar user={session.user} />
        <SidebarInset className="bg-[#f8f9fa] dark:bg-zinc-900 flex flex-col min-h-screen">
          <SiteHeader />
          <div className="flex flex-1 flex-col">
            <div className="flex-1 flex flex-col p-6">{children}</div>
          </div>
        </SidebarInset>
      </JobsProvider>
    </SidebarProvider>
  );
}
