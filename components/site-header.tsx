"use client"

import { useState } from "react"
import Link from "next/link"
import { BellIcon, SearchIcon, Briefcase } from "lucide-react"
import { useJobs } from "@/components/jobs-context"
import { JobsDrawer } from "@/components/jobs-drawer"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { SearchCommand } from "@/components/search-command"
import { NotificationsPopover } from "@/components/notifications-popover"

export function SiteHeader() {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const { setDrawerOpen, jobs } = useJobs()
  const runningCount = jobs.filter(j => j.status === "PENDING" || j.status === "RUNNING").length

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground"
            onClick={() => setIsSearchOpen(true)}
          >
            <SearchIcon className="size-4" />
            <span className="hidden sm:inline text-sm">Search</span>
            <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>

          <SearchCommand open={isSearchOpen} onOpenChange={setIsSearchOpen} />
          
          <NotificationsPopover />

          <Button
            variant="ghost"
            size="icon"
            className="size-9 relative text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => setDrawerOpen(true)}
            title="Tasks Console"
          >
            <Briefcase className="size-[17px]" />
            {runningCount > 0 && (
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-sky-500 animate-pulse border border-background" />
            )}
          </Button>

          <JobsDrawer />
        </div>
      </div>
    </header>
  )
}
