"use client";

import { useState } from "react";
import Link from "next/link";
import { BellIcon, SearchIcon, Briefcase, Command } from "lucide-react";
import { useJobs } from "@/components/jobs-context";
import { JobsDrawer } from "@/components/jobs-drawer";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { SearchCommand } from "@/components/search-command";
import { NotificationsPopover } from "@/components/notifications-popover";

export function SiteHeader() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { setDrawerOpen, jobs } = useJobs();
  const runningCount = jobs.filter(
    (j) => j.status === "PENDING" || j.status === "RUNNING",
  ).length;

  return (
    <header className="flex h-15 shrink-0 items-center gap-4 px-4 lg:px-6 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
      </div>

      <div className="flex-1 flex justify-center max-w-3xl mx-auto">
        <Button
          variant="outline"
          className="w-full max-w-2xl bg-muted/50 hover:bg-muted/80 text-muted-foreground justify-between rounded-full pl-4 pr-2 h-10 border border-transparent shadow-none font-normal cursor-pointer normal-case tracking-normal"
          onClick={() => setIsSearchOpen(true)}
        >
          <div className="flex items-center gap-2">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-sm">Search in Anticloud</span>
          </div>
          <kbd className="hidden sm:inline-flex h-6 select-none items-center gap-0.5 rounded-full border bg-background p-2 font-mono font-medium text-muted-foreground">
            <Command className="size-3.5" />
            <span className="text-sm"></span>K
          </kbd>
        </Button>
      </div>

      <SearchCommand open={isSearchOpen} onOpenChange={setIsSearchOpen} />

      <div className="flex items-center gap-2">
        <NotificationsPopover />

        <Button
          variant="ghost"
          size="icon"
          className="size-9 relative rounded-full text-muted-foreground hover:text-foreground cursor-pointer hover:bg-muted/80"
          onClick={() => setDrawerOpen(true)}
          title="Tasks Console"
        >
          <Briefcase className="size-[17px]" />
          {runningCount > 0 && (
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-zinc-800 dark:bg-zinc-200 animate-pulse border border-background" />
          )}
        </Button>

        <JobsDrawer />
      </div>
    </header>
  );
}
