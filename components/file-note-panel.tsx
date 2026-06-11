"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  getCurrentNote,
  saveNote,
  getNoteHistory,
  type NoteSnapshot,
} from "@/actions/notes";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardFooter,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileNotePanelProps {
  /** The file whose note this panel manages. */
  fileId: string;
  /** Whether the viewing user has ADMIN or owner rights (unlocks history tab). */
  canViewHistory: boolean;
  /** Whether the file is read-only — disables the editor. */
  isReadOnly?: boolean;
  className?: string;
}

type Tab = "editor" | "history";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelative(date: Date): string {
  const delta = Date.now() - date.getTime();
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HistoryEntry({
  note,
  isCurrent,
}: {
  note: NoteSnapshot;
  isCurrent: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 py-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {note.authorName ?? "Unknown"}
        </span>
        <span>·</span>
        <span>{formatRelative(new Date(note.createdAt))}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {isCurrent && (
            <Badge variant="default" className="text-[0.6rem]">
              current
            </Badge>
          )}
          <Badge variant="secondary" className="text-[0.6rem]">
            v{note.version}
          </Badge>
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap break-words text-foreground/80 leading-relaxed">
        {note.body || (
          <span className="italic text-muted-foreground">— empty —</span>
        )}
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * FileNotePanel — shared per-file note editor with optional version history.
 *
 * Usage:
 *   <FileNotePanel fileId="..." canViewHistory={isOwnerOrAdmin} />
 */
export function FileNotePanel({
  fileId,
  canViewHistory,
  isReadOnly = false,
  className,
}: FileNotePanelProps) {
  const [tab, setTab] = React.useState<Tab>("editor");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  const [currentNote, setCurrentNote] = React.useState<NoteSnapshot | null>(
    null,
  );
  const [draftBody, setDraftBody] = React.useState("");
  const [history, setHistory] = React.useState<NoteSnapshot[]>([]);
  const [historyLoaded, setHistoryLoaded] = React.useState(false);

  const isDirty = draftBody !== (currentNote?.body ?? "");

  // ── Load current note on mount ─────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCurrentNote({ fileId })
      .then((note) => {
        if (cancelled) return;
        setCurrentNote(note);
        setDraftBody(note?.body ?? "");
      })
      .catch(() => toast.error("Failed to load note"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  // ── Load history when tab switches ────────────────────────────────────────
  React.useEffect(() => {
    if (tab !== "history" || historyLoaded) return;
    let cancelled = false;
    setHistoryLoading(true);
    getNoteHistory({ fileId })
      .then((rows) => {
        if (cancelled) return;
        setHistory(rows);
        setHistoryLoaded(true);
      })
      .catch(() => toast.error("Failed to load history"))
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, fileId, historyLoaded]);

  // ── Save handler ──────────────────────────────────────────────────────────
  async function handleSave() {
    if (saving || isReadOnly || !isDirty) return;
    setSaving(true);
    try {
      const saved = await saveNote({ fileId, body: draftBody });
      setCurrentNote(saved);
      setDraftBody(saved.body);
      // Invalidate history cache so next visit re-fetches.
      setHistoryLoaded(false);
      toast.success(`Note saved (v${saved.version})`);
    } catch {
      toast.error("Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  // ── Keyboard shortcut: Ctrl/Cmd+S ────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Card className={cn("flex flex-col", className)}>
      {/* Header */}
      <CardHeader className="border-b border-foreground/5">
        <CardTitle>File Note</CardTitle>
        {currentNote && (
          <CardDescription>
            Last edited by{" "}
            <span className="text-foreground">
              {currentNote.authorName ?? "unknown"}
            </span>{" "}
            · {formatRelative(new Date(currentNote.createdAt))} ·{" "}
            <span className="text-foreground">v{currentNote.version}</span>
          </CardDescription>
        )}
        {/* Tab switcher — history restricted to admin/owner */}
        {canViewHistory && (
          <CardAction>
            <div className="flex items-center gap-1 text-xs">
              <button
                id="file-note-tab-editor"
                onClick={() => setTab("editor")}
                className={cn(
                  "px-2 py-1 rounded-sm transition-colors",
                  tab === "editor"
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Edit
              </button>
              <Separator orientation="vertical" className="h-3" />
              <button
                id="file-note-tab-history"
                onClick={() => setTab("history")}
                className={cn(
                  "px-2 py-1 rounded-sm transition-colors",
                  tab === "history"
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                History
              </button>
            </div>
          </CardAction>
        )}
      </CardHeader>

      {/* Body */}
      <CardContent className="flex-1 flex flex-col gap-3 pt-4">
        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : tab === "editor" ? (
          <Textarea
            id="file-note-editor"
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isReadOnly
                ? "This file is read-only — notes cannot be edited."
                : "Write a shared note for this file… (Ctrl+S to save)"
            }
            disabled={isReadOnly || saving}
            className="min-h-[160px] flex-1 resize-none"
            aria-label="File note editor"
          />
        ) : (
          // History tab
          <ScrollArea className="max-h-[360px] pr-2">
            {historyLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-1.5 py-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                  </div>
                ))}
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No note history yet.
              </p>
            ) : (
              <div className="divide-y divide-foreground/5">
                {history.map((entry, idx) => (
                  <HistoryEntry
                    key={entry.id}
                    note={entry}
                    isCurrent={idx === 0}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </CardContent>

      {/* Footer: Save button (editor tab only) */}
      {tab === "editor" && !isReadOnly && (
        <CardFooter className="border-t border-foreground/5 pt-4 flex justify-end gap-2">
          <span className="text-xs text-muted-foreground mr-auto">
            {isDirty ? "Unsaved changes" : currentNote ? "Up to date" : ""}
          </span>
          <Button
            id="file-note-save-btn"
            size="sm"
            onClick={handleSave}
            disabled={saving || !isDirty}
            aria-busy={saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
