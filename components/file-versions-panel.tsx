"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Download, History, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatBytes, formatRelativeDate } from "@/lib/format";
import { deleteVersion, getFileVersions, restoreVersion } from "@/actions/versions";
import type { FileVersionEntry } from "@/lib/versions";

interface FileVersionsPanelProps {
  fileId: string;
  currentVersion: number;
  currentSize: string;
  currentUpdatedAt: string;
  /** Manager without a read-only lock: may restore/delete versions. */
  canEdit: boolean;
  onChanged: () => void;
}

type PendingAction = { kind: "restore" | "delete"; version: FileVersionEntry } | null;

/** Version history of a file: download, restore, or delete earlier content. */
export function FileVersionsPanel({
  fileId,
  currentVersion,
  currentSize,
  currentUpdatedAt,
  canEdit,
  onChanged,
}: FileVersionsPanelProps) {
  const [versions, setVersions] = useState<FileVersionEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    try {
      setError(null);
      setVersions(await getFileVersions({ fileId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load versions");
    }
  }, [fileId]);

  useEffect(() => {
    load();
  }, [load, currentVersion]);

  const confirm = () => {
    if (!pending) return;
    const { kind, version } = pending;
    startTransition(async () => {
      try {
        if (kind === "restore") {
          await restoreVersion({ versionId: version.id });
          toast.success(`Restored version ${version.version}`);
          onChanged();
        } else {
          await deleteVersion({ versionId: version.id });
          toast.success(`Deleted version ${version.version}`);
        }
        setPending(null);
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold flex items-center gap-2">
            Version {currentVersion}
            <Badge variant="secondary" className="text-[10px] uppercase">Current</Badge>
          </span>
          <span className="text-xs text-muted-foreground">
            {formatBytes(currentSize)} · updated {formatRelativeDate(currentUpdatedAt)}
          </span>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {versions === null && !error ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="size-4 animate-spin" /> Loading history…
        </div>
      ) : versions && versions.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-6 text-center text-muted-foreground">
          <History className="size-8 text-muted-foreground/30" />
          <span className="text-sm font-medium">No previous versions</span>
          <span className="text-xs">
            Replacing the file keeps the old content here.
          </span>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {versions?.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium">Version {v.version}</span>
                <span className="text-xs text-muted-foreground truncate">
                  {formatBytes(v.size)} · uploaded {formatRelativeDate(v.uploadedAt)}
                  {v.uploadedBy ? ` by ${v.uploadedBy.name}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <a
                    href={`/api/files/${fileId}/versions/${v.id}?download=1`}
                    title="Download this version"
                  >
                    <Download className="size-4" />
                    <span className="sr-only">Download version {v.version}</span>
                  </a>
                </Button>
                {canEdit && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Restore this version"
                      disabled={isPending}
                      onClick={() => setPending({ kind: "restore", version: v })}
                    >
                      <RotateCcw className="size-4" />
                      <span className="sr-only">Restore version {v.version}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title="Delete this version"
                      disabled={isPending}
                      onClick={() => setPending({ kind: "delete", version: v })}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Delete version {v.version}</span>
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "restore"
                ? `Restore version ${pending.version.version}?`
                : `Delete version ${pending?.version.version}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "restore"
                ? "The current content is kept in the history, so you can switch back later."
                : "This version's content is removed permanently. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                pending?.kind === "delete"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              onClick={(e) => {
                e.preventDefault();
                confirm();
              }}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : pending?.kind === "restore" ? (
                "Restore"
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
