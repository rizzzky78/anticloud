"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FolderInput,
  FolderPlus,
  Loader2,
  MoreVertical,
  Pencil,
  Share2,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderShareDialog } from "@/components/folder-share-dialog";
import { createFolder, deleteFolder, moveFolder, renameFolder } from "@/actions/folders";

interface FolderToolbarProps {
  currentFolderPath: string;
  folderPaths: string[];
  canUpload: boolean;
  canManage: boolean;
  ownerName: string | null;
  isOwner: boolean;
}

function lastSegment(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "/";
}

function parentOf(path: string) {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return "/" + parts.join("/");
}

/** Folder actions for the folder currently open in the file browser. */
export function FolderToolbar({
  currentFolderPath,
  folderPaths,
  canUpload,
  canManage,
  ownerName,
  isOwner,
}: FolderToolbarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"create" | "rename" | "move" | "delete" | "share" | null>(null);
  const [name, setName] = useState("");
  const [moveTarget, setMoveTarget] = useState("/");

  const isRoot = currentFolderPath === "/";

  // Every known folder (and its ancestors) except this one and its subtree.
  const moveTargets = Array.from(
    new Set(
      ["/", ...folderPaths].flatMap((p) => {
        const parts = p.split("/").filter(Boolean);
        return parts.map((_, i) => "/" + parts.slice(0, i + 1).join("/")).concat("/");
      }),
    ),
  )
    .filter(
      (p) =>
        p !== currentFolderPath &&
        !p.startsWith(currentFolderPath + "/") &&
        p !== parentOf(currentFolderPath),
    )
    .sort();

  const run = (fn: () => Promise<void>, fallback: string) =>
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : fallback);
      }
    });

  const goTo = (path: string) => {
    router.push(`/files?folderPath=${encodeURIComponent(path)}`);
    router.refresh();
  };

  const submitCreate = () =>
    run(async () => {
      const { path } = await createFolder({ parentPath: currentFolderPath, name });
      toast.success(`Folder "${lastSegment(path)}" created`);
      setDialog(null);
      goTo(path);
    }, "Failed to create folder");

  const submitRename = () =>
    run(async () => {
      const { path } = await renameFolder({ path: currentFolderPath, name });
      toast.success("Folder renamed");
      setDialog(null);
      goTo(path);
    }, "Failed to rename folder");

  const submitMove = () =>
    run(async () => {
      const { path } = await moveFolder({ path: currentFolderPath, newParentPath: moveTarget });
      toast.success("Folder moved");
      setDialog(null);
      goTo(path);
    }, "Failed to move folder");

  const submitDelete = () =>
    run(async () => {
      const { filesTrashed } = await deleteFolder({ path: currentFolderPath });
      toast.success(
        `Folder deleted${filesTrashed ? ` · ${filesTrashed} file(s) moved to the Recycle Bin` : ""}`,
      );
      setDialog(null);
      goTo(parentOf(currentFolderPath));
    }, "Failed to delete folder");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isRoot && ownerName && !isOwner && (
        <Badge variant="outline" className="gap-1 font-normal">
          <UserRound className="size-3" /> Owned by {ownerName}
        </Badge>
      )}

      {canUpload && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setName("");
            setDialog("create");
          }}
        >
          <FolderPlus className="size-4 mr-1.5" /> New folder
        </Button>
      )}

      {!isRoot && canManage && (
        <>
          <Button variant="outline" size="sm" onClick={() => setDialog("share")}>
            <Share2 className="size-4 mr-1.5" /> Share folder
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 border" title="Folder actions">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={() => {
                  setName(lastSegment(currentFolderPath));
                  setDialog("rename");
                }}
              >
                <Pencil className="size-4 mr-2" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setMoveTarget(moveTargets[0] ?? "/");
                  setDialog("move");
                }}
              >
                <FolderInput className="size-4 mr-2" /> Move
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDialog("delete")}
              >
                <Trash2 className="size-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      <Dialog
        open={dialog === "create" || dialog === "rename"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "create" ? "New folder" : "Rename folder"}</DialogTitle>
            <DialogDescription>
              {dialog === "create"
                ? `Create a folder inside ${isRoot ? "your files" : lastSegment(currentFolderPath)}. You will own it.`
                : "Files inside keep their access settings."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="folder-name">Name</Label>
            <Input
              id="folder-name"
              value={name}
              maxLength={128}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  dialog === "create" ? submitCreate() : submitRename();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={dialog === "create" ? submitCreate : submitRename}
              disabled={isPending || !name.trim()}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : dialog === "create" ? "Create" : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "move"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move folder</DialogTitle>
            <DialogDescription>
              Move &quot;{lastSegment(currentFolderPath)}&quot; and everything inside it.
            </DialogDescription>
          </DialogHeader>
          <Select value={moveTarget} onValueChange={setMoveTarget}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {moveTargets.map((p) => (
                <SelectItem key={p} value={p}>
                  {p === "/" ? "/ (root)" : p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={submitMove} disabled={isPending || moveTargets.length === 0}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={dialog === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              Every file in &quot;{lastSegment(currentFolderPath)}&quot; and its subfolders moves to
              the Recycle Bin, and the folder&apos;s shares are removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                submitDelete();
              }}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete folder"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!isRoot && canManage && (
        <FolderShareDialog
          path={currentFolderPath}
          open={dialog === "share"}
          onOpenChange={(open) => setDialog(open ? "share" : null)}
        />
      )}
    </div>
  );
}
