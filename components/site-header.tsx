"use client"

import { useState } from "react"
import Link from "next/link"
import { BellIcon, SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { SearchCommand } from "@/components/search-command"

export function SiteHeader() {
  const [isSearchOpen, setIsSearchOpen] = useState(false)

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
          <Button variant="ghost" size="icon" className="relative" asChild>
            <Link href="/notifications">
              <BellIcon className="size-4" />
              <Badge
                variant="destructive"
                className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] leading-none"
                data-notifications-badge
              >
                0
              </Badge>
              <span className="sr-only">Notifications</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
