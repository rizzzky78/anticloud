"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { BellIcon, CheckIcon, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@/lib/format";
import {
  getNotifications,
  markAsRead,
  markAllRead,
  getUnreadCount,
} from "@/actions/notifications";

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  readAt: Date | string | null;
  createdAt: Date | string;
  file: {
    id: string;
    displayName: string;
  } | null;
}

export function NotificationsPopover() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Load unread count
  const loadUnreadCount = useCallback(async () => {
    try {
      const count = await getUnreadCount();
      setUnreadCount(count);
    } catch (err) {
      console.error("Failed to load unread count", err);
    }
  }, []);

  // Load recent notifications
  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotifications({ limit: 10 });
      // Map Date objects to string if they are serialized
      setNotifications(data.notifications as any);
    } catch (err) {
      console.error("Failed to load notifications", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sync data on mount and focus
  useEffect(() => {
    loadUnreadCount();

    // Poll count every 15 seconds
    const interval = setInterval(() => {
      loadUnreadCount();
      if (isOpen) {
        loadNotifications();
      }
    }, 15000);

    // Refresh on focus
    const onFocus = () => {
      loadUnreadCount();
      if (isOpen) {
        loadNotifications();
      }
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [isOpen, loadUnreadCount, loadNotifications]);

  // Reload when pathname changes (navigation)
  useEffect(() => {
    loadUnreadCount();
  }, [pathname, loadUnreadCount]);

  // Load notifications when popover is opened
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      loadNotifications();
      loadUnreadCount();
    }
  };

  const handleMarkAsRead = async (id: string, fileId?: string) => {
    try {
      await markAsRead({ notificationId: id });
      
      // Update local state
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      // Router refresh and navigation
      router.refresh();
      if (fileId) {
        router.push(`/files/${fileId}`);
      }
      setIsOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to mark notification as read");
    }
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      try {
        await markAllRead();
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, readAt: new Date() }))
        );
        setUnreadCount(0);
        toast.success("All notifications marked as read");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message || "Failed to mark all notifications as read");
      }
    });
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative cursor-pointer">
          <BellIcon className="size-5 text-muted-foreground hover:text-foreground transition-colors" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] leading-none flex items-center justify-center animate-pulse"
              data-notifications-badge
            >
              {unreadCount}
            </Badge>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 sm:w-96 p-0 mr-4 shadow-xl border border-border/80" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/85 bg-muted/40">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                {unreadCount} unread
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={handleMarkAllRead}
              className="h-7 text-xs px-2 text-primary hover:text-primary/95 font-medium flex items-center gap-1"
            >
              {isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <CheckIcon className="size-3" />
              )}
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="h-[320px] w-full">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground space-y-2">
              <Loader2 className="size-6 animate-spin text-primary/60" />
              <span className="text-xs">Loading notifications...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[280px] p-6 text-center text-muted-foreground space-y-2">
              <Sparkles className="size-8 text-muted-foreground/40 stroke-[1.5]" />
              <span className="text-sm font-medium">All caught up!</span>
              <span className="text-xs text-muted-foreground/80 max-w-[200px]">
                You have no recent notifications.
              </span>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((item) => {
                const isUnread = !item.readAt;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleMarkAsRead(item.id, item.file?.id)}
                    className={cn(
                      "flex flex-col gap-1.5 p-4 border-b border-border/40 hover:bg-muted/50 cursor-pointer transition-colors relative group",
                      isUnread && "bg-primary/5 hover:bg-primary/10"
                    )}
                  >
                    {isUnread && (
                      <span className="absolute left-1.5 top-5 size-2 rounded-full bg-primary" />
                    )}
                    <div className="text-sm text-foreground leading-snug pr-4">
                      {item.message}
                    </div>
                    {item.file && (
                      <div className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
                        📁 {item.file.displayName}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground">
                      {formatRelativeDate(item.createdAt.toString())}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
        <div className="border-t border-border/60 p-2 text-center bg-muted/20">
          <Link
            href="/notifications"
            onClick={() => setIsOpen(false)}
            className="text-xs text-primary font-medium hover:underline block py-1.5 w-full"
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
