"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";

import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import { Button } from "@/components/ui/button";
import { UploadDialog } from "@/components/upload-dialog";
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
} from "@/components/ui/sidebar";
import {
  FolderIcon,
  SearchIcon,
  BellIcon,
  UsersIcon,
  Trash2Icon,
  BriefcaseIcon,
  Settings2Icon,
  CloudIcon,
  UploadIcon,
} from "lucide-react";

interface AppSidebarUser {
  id?: string;
  name: string;
  email: string;
  image?: string | null;
  role?: string | null;
}

const adminNavItems = [
  { title: "Users & Roles", url: "/admin/users", icon: <UsersIcon /> },
  { title: "Recycle Bin", url: "/admin/recycle-bin", icon: <Trash2Icon /> },
  { title: "Jobs", url: "/admin/jobs", icon: <BriefcaseIcon /> },
];

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user?: AppSidebarUser }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isUploadOpen, setIsUploadOpen] = React.useState(false);

  const currentUser = user || {
    name: "Mock User",
    email: "mock@example.com",
    role: "VIEWER",
  };

  const isAdmin =
    currentUser.role === "ADMIN" || currentUser.role === "SUPERADMIN";

  const currentFolderPath = searchParams.get("folderPath") ?? "/";

  const navMain = [
    { title: "Files", url: "/files", icon: <FolderIcon /> },
    { title: "Search", url: "/search", icon: <SearchIcon /> },
    { title: "Notifications", url: "/notifications", icon: <BellIcon /> },
    { title: "Recycle Bin", url: "/trash", icon: <Trash2Icon /> },
  ];

  return (
    <>
      <Sidebar collapsible="offcanvas" {...props}>
        <SidebarHeader className="gap-4 dark:bg-zinc-900">
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

          <div className="px-4 py-1">
            <Button
              onClick={() => setIsUploadOpen(true)}
              className="w-full rounded-full shadow-md bg-white hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-200/80 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 h-12 px-5 font-semibold gap-2.5 justify-center text-sm cursor-pointer"
            >
              <UploadIcon className="size-4.5" />
              <span>Upload File</span>
            </Button>
          </div>
        </SidebarHeader>

        <SidebarContent className="dark:bg-zinc-900">
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

        <SidebarFooter className="dark:bg-zinc-900">
          <NavUser
            user={{
              name: currentUser.name,
              email: currentUser.email,
              avatar: currentUser.image ?? "",
            }}
          />
        </SidebarFooter>
      </Sidebar>
      <UploadDialog
        isOpen={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        currentFolderPath={currentFolderPath}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </>
  );
}
