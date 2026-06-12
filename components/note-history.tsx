"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getNoteHistory, type NoteSnapshot } from "@/actions/notes";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Clock, History, AlertTriangle, User } from "lucide-react";
import { formatRelativeDate } from "@/lib/format";
import { toast } from "sonner";

interface NoteHistoryDialogProps {
  fileId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  canView: boolean;
}

export function NoteHistoryDialog({
  fileId,
  isOpen,
  onOpenChange,
  canView,
}: NoteHistoryDialogProps) {
  const [history, setHistory] = useState<NoteSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isOpen && canView) {
      setLoading(true);
      setError(false);
      getNoteHistory({ fileId, limit: 50 })
        .then((data) => {
          setHistory(data);
        })
        .catch((err) => {
          console.error("Failed to load note history", err);
          setError(true);
          toast.error("Failed to load note history");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, fileId, canView]);

  if (!canView) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5 text-muted-foreground" /> Note Version History
          </DialogTitle>
          <DialogDescription>
            View all past collaborative notes saved for this file, ordered from newest to oldest.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
          {loading ? (
            <div className="p-6 space-y-4 flex-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <Skeleton className="size-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <AlertTriangle className="size-8 text-destructive mb-2" />
              <p className="text-sm font-medium">Failed to load note history</p>
              <p className="text-xs mt-1">Please make sure you have appropriate permissions.</p>
            </div>
          ) : history.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <Clock className="size-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm">No version history recorded yet</p>
              <p className="text-xs mt-1">Edits to the shared note will generate version history here.</p>
            </div>
          ) : (
            <ScrollArea className="flex-1 p-6">
              <div className="relative pl-6 border-l border-muted space-y-6 ml-2">
                {history.map((version, idx) => {
                  const isCurrent = idx === 0;
                  return (
                    <div key={version.id} className="relative">
                      {/* Timeline dot */}
                      <div className="absolute -left-[31px] top-1 bg-background p-0.5 rounded-full border">
                        <div className={`size-3 rounded-full ${isCurrent ? "bg-primary" : "bg-muted-foreground/30"}`} />
                      </div>

                      <div className="space-y-2">
                        {/* Header details */}
                        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground flex items-center gap-1">
                            <User className="size-3" /> {version.authorName || "System / Unknown"}
                          </span>
                          <span>•</span>
                          <span>{formatRelativeDate(new Date(version.createdAt).toISOString())}</span>
                          {isCurrent && (
                            <Badge variant="secondary" className="text-[0.65rem] h-4 px-1.5 rounded-sm leading-none bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-none">
                              Current Version
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[0.65rem] h-4 px-1.5 rounded-sm">
                            v{version.version}
                          </Badge>
                        </div>

                        {/* Content snippet */}
                        <div className="bg-muted/40 border rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap font-sans break-words text-foreground/80 max-h-48 overflow-y-auto">
                          {version.body || <span className="italic text-muted-foreground">Empty note body</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
