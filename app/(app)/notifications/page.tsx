"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCheck,
  Loader2,
  Bell,
  Inbox,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export default function NotificationsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"all" | "unread">("all");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isPending, startTransition] = useTransition();

  const loadUnreadCount = useCallback(async () => {
    try {
      const count = await getUnreadCount();
      setUnreadCount(count);
    } catch (err) {
      console.error("Failed to load unread count", err);
    }
  }, []);

  // Fetch initial notifications
  const fetchNotifications = useCallback(
    async (tab: "all" | "unread", clearExisting = true) => {
      if (clearExisting) {
        setLoading(true);
      }
      try {
        const data = await getNotifications({
          unreadOnly: tab === "unread",
          limit: 20,
        });
        setNotifications(data.notifications as any);
        setNextCursor(data.nextCursor);
      } catch (err: any) {
        toast.error(err?.message || "Failed to load notifications");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Fetch more notifications for pagination
  const fetchMoreNotifications = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await getNotifications({
        unreadOnly: activeTab === "unread",
        limit: 20,
        cursor: nextCursor,
      });
      setNotifications((prev) => [...prev, ...(data.notifications as any)]);
      setNextCursor(data.nextCursor);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load more notifications");
    } finally {
      setLoadingMore(false);
    }
  };

  // Sync unread count and fetch notifications when tab changes or on mount
  useEffect(() => {
    loadUnreadCount();
    fetchNotifications(activeTab, true);
  }, [activeTab, loadUnreadCount, fetchNotifications]);

  const handleMarkAsRead = async (id: string, fileId?: string) => {
    try {
      await markAsRead({ notificationId: id });

      // Update local state
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date() } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      // If viewing unread tab, remove from view
      if (activeTab === "unread") {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }

      router.refresh();
      if (fileId) {
        router.push(`/files/${fileId}`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to mark notification as read");
    }
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      try {
        await markAllRead();
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, readAt: new Date() })),
        );
        if (activeTab === "unread") {
          setNotifications([]);
        }
        setUnreadCount(0);
        toast.success("All notifications marked as read");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message || "Failed to mark all notifications as read");
      }
    });
  };

  return (
    <div className="flex-1 space-y-6 w-full mx-auto">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 md:hidden cursor-pointer"
              onClick={() => router.back()}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Bell className="size-6 text-primary" /> Notification Center
            </h1>
          </div>
          <p className="text-muted-foreground text-sm pl-0 md:pl-0">
            Stay updated with file shares, mentions, and collaborator actions.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            onClick={handleMarkAllRead}
            disabled={isPending}
            variant="outline"
            size="sm"
            className="w-full sm:w-auto gap-2 text-xs font-semibold cursor-pointer border-border hover:bg-muted"
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <CheckCheck className="size-4 text-primary" />
            )}
            Mark all read
          </Button>
        )}
      </div>

      <Card className="border border-border/80 shadow-md">
        <Tabs
          defaultValue="all"
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "all" | "unread")}
          className="w-full"
        >
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <TabsList className="grid grid-cols-2 w-full sm:w-[240px] h-9">
                <TabsTrigger value="all" className="text-xs">
                  All
                </TabsTrigger>
                <TabsTrigger
                  value="unread"
                  className="text-xs flex items-center gap-1.5"
                >
                  Unread
                  {unreadCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="h-4 px-1 min-w-4 text-[9px] flex items-center justify-center"
                    >
                      {unreadCount}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
              <span className="text-xs text-muted-foreground italic hidden sm:inline">
                Showing newest notifications first
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-4 p-6">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="flex gap-4 items-start border-b border-border/30 pb-4 last:border-0"
                  >
                    <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-[60%] bg-muted rounded animate-pulse" />
                      <div className="h-3 w-[20%] bg-muted rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                <Inbox className="size-12 text-muted-foreground/30 stroke-[1.2] mb-4" />
                <h3 className="text-base font-semibold text-foreground">
                  No notifications found
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-1">
                  {activeTab === "unread"
                    ? "You have no unread notifications right now."
                    : "No notifications have been received yet."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {notifications.map((item) => {
                  const isUnread = !item.readAt;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleMarkAsRead(item.id, item.file?.id)}
                      className={cn(
                        "flex items-start gap-4 p-5 hover:bg-muted/40 cursor-pointer transition-colors relative group",
                        isUnread && "bg-primary/5 hover:bg-primary/10",
                      )}
                    >
                      {isUnread && (
                        <span className="absolute left-2.5 top-7 size-2 rounded-full bg-primary" />
                      )}

                      <div className="flex-1 min-w-0 space-y-1">
                        <p
                          className={cn(
                            "text-sm leading-relaxed text-foreground",
                            isUnread && "font-medium",
                          )}
                        >
                          {item.message}
                        </p>

                        {item.file && (
                          <div className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline mt-1 bg-primary/10 px-2 py-0.5 rounded">
                            📁 {item.file.displayName}
                          </div>
                        )}

                        <p className="text-[11px] text-muted-foreground">
                          {formatRelativeDate(item.createdAt.toString())}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {nextCursor && !loading && (
              <div className="p-4 text-center border-t border-border/40 bg-muted/5">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={loadingMore}
                  onClick={fetchMoreNotifications}
                  className="w-full sm:w-auto text-xs font-medium cursor-pointer"
                >
                  {loadingMore && (
                    <Loader2 className="size-3.5 animate-spin mr-2" />
                  )}
                  {loadingMore ? "Loading more..." : "Load more notifications"}
                </Button>
              </div>
            )}
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
