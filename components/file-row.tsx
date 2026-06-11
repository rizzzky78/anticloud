"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { TableCell, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  MoreHorizontal,
  Download,
  Edit2,
  FolderInput,
  Eye,
  RefreshCw,
  Trash2,
  Lock,
  Globe,
  Settings,
  Share2,
} from "lucide-react";
import { FileListEntry } from "@/lib/file-list";
import { formatBytes, formatRelativeDate } from "@/lib/format";
import { canManage } from "@/lib/ui-access";
import { getFileIcon } from "@/components/file-list-types";
import { RenameDialog } from "@/components/rename-dialog";
import { MoveDialog } from "@/components/move-dialog";
import { VisibilityDialog } from "@/components/visibility-dialog";
import { ReplaceFileDialog } from "@/components/replace-file-dialog";
import { FileShareDialog } from "@/components/file-share-dialog";
import { softDeleteFile } from "@/actions/file-config";
import { toast } from "sonner";

interface FileRowProps {
  file: FileListEntry;
  userId: string;
  userRole: string;
  folderPaths: string[];
  onSuccess: () => void;
  isSelected?: boolean;
  onSelectChange?: (checked: boolean) => void;
}

export function FileRow({
  file,
  userId,
  userRole,
  folderPaths,
  onSuccess,
  isSelected = false,
  onSelectChange,
}: FileRowProps) {
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [isVisibilityOpen, setIsVisibilityOpen] = useState(false);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const FileIconComponent = getFileIcon(file.mimeType);
  const isMutateDisabled = file.isReadOnly && userRole !== "SUPERADMIN";
  const userCanManage = canManage(file, userId, userRole);

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await softDeleteFile({ fileId: file.id });
        toast.success("File moved to recycle bin");
        setIsDeleteOpen(false);
        onSuccess();
      } catch (err: any) {
        toast.error(err?.message || "Failed to delete file");
      }
    });
  };

  const wrapWithTooltip = (
    element: React.ReactNode,
    disabled: boolean,
    reason: string,
  ) => {
    if (!disabled) return element;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-full">{element}</div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{reason}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <>
      <TableRow className="group hover:bg-muted/50 cursor-pointer transition-colors">
        {onSelectChange && (
          <TableCell
            className="w-[40px] p-4 py-3"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelectChange(!!checked)}
              aria-label={`Select ${file.displayName}`}
            />
          </TableCell>
        )}
        <TableCell
          className="font-medium p-4 py-3"
          onClick={() => (window.location.href = `/files/${file.id}`)}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-muted/80 text-muted-foreground group-hover:bg-background group-hover:text-primary transition-colors">
              <FileIconComponent className="size-4 shrink-0" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="truncate text-sm font-medium hover:underline">
                {file.displayName}
              </span>
              <span className="text-xs text-muted-foreground sm:hidden">
                {formatBytes(file.size)} • {formatRelativeDate(file.createdAt)}
              </span>
            </div>
          </div>
        </TableCell>
        <TableCell
          className="hidden sm:table-cell py-3"
          onClick={() => (window.location.href = `/files/${file.id}`)}
        >
          {formatBytes(file.size)}
        </TableCell>
        <TableCell
          className="hidden md:table-cell py-3"
          onClick={() => (window.location.href = `/files/${file.id}`)}
        >
          <div className="flex flex-wrap gap-1.5">
            {file.visibility === "PUBLIC" ? (
              <Badge
                variant="secondary"
                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none"
              >
                <Globe className="size-3 mr-1" /> Public
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <Lock className="size-3 mr-1" /> Private
              </Badge>
            )}
            {file.visibility === "PUBLIC" && file.guestAccess && (
              <Badge
                variant="secondary"
                className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-none"
              >
                Guest
              </Badge>
            )}
            {file.isReadOnly && (
              <Badge
                variant="destructive"
                className="bg-destructive/10 text-destructive border-none"
              >
                Read-only
              </Badge>
            )}
            {file.isMentionRestricted && (
              <Badge
                variant="secondary"
                className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-none"
              >
                Gated
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell
          className="hidden lg:table-cell py-3"
          onClick={() => (window.location.href = `/files/${file.id}`)}
        >
          {formatRelativeDate(file.createdAt)}
        </TableCell>
        <TableCell className="text-right py-3 p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <a
                  href={`/api/files/${file.id}`}
                  download={file.displayName}
                  className="flex items-center w-full"
                >
                  <Download className="size-4 mr-2" /> Download
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={`/files/${file.id}`}
                  className="flex items-center w-full"
                >
                  <Settings className="size-4 mr-2" /> Configure
                </Link>
              </DropdownMenuItem>
              {userCanManage && (
                <>
                  <DropdownMenuSeparator />
                  {wrapWithTooltip(
                    <DropdownMenuItem
                      onClick={() => setIsRenameOpen(true)}
                      disabled={isMutateDisabled}
                    >
                      <Edit2 className="size-4 mr-2" /> Rename
                    </DropdownMenuItem>,
                    isMutateDisabled,
                    "This file is read-only",
                  )}
                  {wrapWithTooltip(
                    <DropdownMenuItem
                      onClick={() => setIsMoveOpen(true)}
                      disabled={isMutateDisabled}
                    >
                      <FolderInput className="size-4 mr-2" /> Move
                    </DropdownMenuItem>,
                    isMutateDisabled,
                    "This file is read-only",
                  )}
                  <DropdownMenuItem onClick={() => setIsVisibilityOpen(true)}>
                    <Eye className="size-4 mr-2" /> Visibility
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsShareOpen(true)}>
                    <Share2 className="size-4 mr-2" /> Share
                  </DropdownMenuItem>
                  {wrapWithTooltip(
                    <DropdownMenuItem
                      onClick={() => setIsReplaceOpen(true)}
                      disabled={isMutateDisabled}
                    >
                      <RefreshCw className="size-4 mr-2" /> Replace
                    </DropdownMenuItem>,
                    isMutateDisabled,
                    "This file is read-only",
                  )}
                  <DropdownMenuSeparator />
                  {wrapWithTooltip(
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      onClick={() => setIsDeleteOpen(true)}
                      disabled={isMutateDisabled}
                    >
                      <Trash2 className="size-4 mr-2" /> Delete
                    </DropdownMenuItem>,
                    isMutateDisabled,
                    "This file is read-only",
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      {/* Dialogs */}
      {userCanManage && (
        <>
          <RenameDialog
            isOpen={isRenameOpen}
            onOpenChange={setIsRenameOpen}
            fileId={file.id}
            currentName={file.displayName}
            onSuccess={onSuccess}
          />
          <MoveDialog
            isOpen={isMoveOpen}
            onOpenChange={setIsMoveOpen}
            fileId={file.id}
            currentFolder={file.folderPath}
            folderPaths={folderPaths}
            onSuccess={onSuccess}
          />
          <VisibilityDialog
            isOpen={isVisibilityOpen}
            onOpenChange={setIsVisibilityOpen}
            fileId={file.id}
            currentVisibility={file.visibility as "PUBLIC" | "PRIVATE"}
            currentGuestAccess={file.guestAccess}
            onSuccess={onSuccess}
          />
          <ReplaceFileDialog
            isOpen={isReplaceOpen}
            onOpenChange={setIsReplaceOpen}
            fileId={file.id}
            fileName={file.displayName}
            onSuccess={onSuccess}
          />
          <FileShareDialog
            isOpen={isShareOpen}
            onOpenChange={setIsShareOpen}
            fileId={file.id}
            file={file as any}
            currentUserRole={userRole}
            currentUserId={userId}
            onOpenVisibility={() => {
              setIsShareOpen(false);
              setIsVisibilityOpen(true);
            }}
            onOpenConfig={() => {
              // Redirect to detail page to configure lifecycle
              window.location.href = `/files/${file.id}`;
            }}
            onSuccess={onSuccess}
          />
          <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Move file to Recycle Bin?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to move &quot;{file.displayName}&quot;
                  to the Recycle Bin? You can restore it within 30 days before
                  it is permanently hard deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(e) => {
                    e.preventDefault();
                    handleDelete();
                  }}
                  disabled={isPending}
                >
                  {isPending ? "Deleting..." : "Move to Recycle Bin"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  );
}
