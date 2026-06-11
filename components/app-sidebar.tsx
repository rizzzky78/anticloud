"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar"
import {
  FolderIcon,
  SearchIcon,
  BellIcon,
  UsersIcon,
  Trash2Icon,
  BriefcaseIcon,
  Settings2Icon,
  CloudIcon,
} from "lucide-react"

interface AppSidebarUser {
  id?: string
  name: string
  email: string
  image?: string | null
  role?: string
}

const adminNavItems = [
  { title: "Users & Roles", url: "/admin/users", icon: <UsersIcon /> },
  { title: "Recycle Bin", url: "/admin/recycle", icon: <Trash2Icon /> },
  { title: "Jobs", url: "/admin/jobs", icon: <BriefcaseIcon /> },
]

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: AppSidebarUser }) {
  const pathname = usePathname()
  const isAdmin = user.role === "ADMIN" || user.role === "SUPERADMIN"

  const navMain = [
    { title: "Files", url: "/files", icon: <FolderIcon /> },
    { title: "Search", url: "/search", icon: <SearchIcon /> },
    { title: "Notifications", url: "/notifications", icon: <BellIcon /> },
  ]

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link href="/files">
                <CloudIcon className="size-5!" />
                <span className="text-base font-semibold">Anticloud</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={navMain} />

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNavItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={
                        pathname === item.url ||
                        pathname.startsWith(item.url + "/")
                      }
                    >
                      <Link href={item.url}>
                        {item.icon}
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <NavSecondary
          items={[
            {
              title: "Settings",
              url: "/settings",
              icon: <Settings2Icon />,
            },
          ]}
          className="mt-auto"
        />
      </SidebarContent>

      <SidebarFooter>
        <NavUser
          user={{
            name: user.name,
            email: user.email,
            avatar: user.image ?? "",
          }}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
