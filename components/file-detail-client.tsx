"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatBytes, formatRelativeDate } from "@/lib/format";
import { canManage } from "@/lib/ui-access";
import { getFileIcon } from "@/components/file-list-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  Edit2,
  FolderInput,
  Eye,
  RefreshCw,
  Download,
  Trash2,
  Settings,
  Globe,
  Lock,
  FileText,
  User,
  HardDrive,
  Calendar,
  Share2,
  Info,
  CornerUpLeft,
  ChevronRight,
  MoreVertical,
  AlertTriangle,
  FileUp,
  History,
} from "lucide-react";
import { RenameDialog } from "@/components/rename-dialog";
import { MoveDialog } from "@/components/move-dialog";
import { VisibilityDialog } from "@/components/visibility-dialog";
import { ReplaceFileDialog } from "@/components/replace-file-dialog";
import { FileConfigPanel } from "@/components/file-config-panel";
import { FileTags } from "@/components/file-tags";
import { FileMentions } from "@/components/file-mentions";
import { FileNotePanel } from "@/components/file-note-panel";
import { TextFilePreview } from "@/components/text-file-preview";
import {
  ImageViewer,
  VideoPlayer,
  AudioPlayer,
} from "@/components/file-media-viewer";
import { NoteHistoryDialog } from "@/components/note-history";
import { FileSharingPanel } from "@/components/file-sharing-panel";
import { softDeleteFile, recoverFile } from "@/actions/file-config";
import { compress, promoteDerivative } from "@/actions/compress";
import { useJobs } from "@/components/jobs-context";
import { FileMetaRecord } from "@/lib/file-meta";
import { toast } from "sonner";

export interface DerivedFile {
  id: string;
  displayName: string;
  size: string;
  mimeType: string;
  createdAt: string;
}

interface MentionedUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  username: string | null;
}

interface FileDetailClientProps {
  file: FileMetaRecord;
  ownerName: string;
  user: {
    id: string;
    role: string;
    email: string;
    name: string;
  };
  folderPaths: string[];
  initialTags: string[];
  initialMentions: MentionedUser[];
  permissionLevel: string;
  initialDerivatives?: DerivedFile[];
  initialParentFile?: DerivedFile | null;
}

export function FileDetailClient({
  file,
  ownerName,
  user,
  folderPaths,
  initialTags,
  initialMentions,
  permissionLevel,
  initialDerivatives = [],
  initialParentFile = null,
}: FileDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { addJob } = useJobs();
  const [isCompressing, setIsCompressing] = useState(false);
  const [isPromoting, setIsPromoting] = useState<string | null>(null);

  const derivatives = initialDerivatives;
  const parentFile = initialParentFile;

  // Dialog & panel states
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [isVisibilityOpen, setIsVisibilityOpen] = useState(false);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const FileIconComponent = getFileIcon(file.mimeType);
  const isMutateDisabled = file.isReadOnly && user.role !== "SUPERADMIN";
  const userCanManage = canManage(file, user.id, user.role);
  const isSoftDeleted = !!file.deletedAt;

  // Check if previewable
  const isImage = file.mimeType.startsWith("image/");
  const isVideo = file.mimeType.startsWith("video/");
  const isAudio = file.mimeType.startsWith("audio/");
  const isPdf = file.mimeType === "application/pdf";
  const isText =
    file.mimeType.startsWith("text/") ||
    file.mimeType === "application/json" ||
    file.mimeType === "application/javascript";
  const isPreviewable = isImage || isVideo || isAudio || isPdf || isText;

  // Stable streaming endpoint for media — honors Range requests for seeking.
  const fileSrc = `/api/files/${file.id}`;

  // Note history view restricted to owner and admin/superadmin
  const canViewNoteHistory =
    permissionLevel === "SUPERADMIN" ||
    permissionLevel === "ADMIN" ||
    file.ownerId === user.id;

  const handleRefresh = () => {
    router.refresh();
  };

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await softDeleteFile({ fileId: file.id });
        toast.success("File moved to recycle bin");
        setIsDeleteOpen(false);
        router.push("/files");
      } catch (err: any) {
        toast.error(err?.message || "Failed to delete file");
      }
    });
  };

  const handleRecover = () => {
    startTransition(async () => {
      try {
        await recoverFile({ fileId: file.id });
        toast.success("File recovered successfully");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message || "Failed to recover file");
      }
    });
  };

  const handleCompress = async () => {
    setIsCompressing(true);
    const toastId = toast.loading("Queueing compression job...");
    try {
      const { jobId } = await compress({ fileId: file.id });
      addJob(jobId);
      toast.success("Compression job enqueued!", {
        id: toastId,
        description: "You can track the job progress in your tasks console.",
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to start compression", {
        id: toastId,
      });
    } finally {
      setIsCompressing(false);
    }
  };

  const handlePromote = async (derivativeId: string) => {
    setIsPromoting(derivativeId);
    const toastId = toast.loading("Swapping files to make canonical...");
    try {
      await promoteDerivative({ derivativeId });
      toast.success("File promoted to canonical!", { id: toastId });
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to promote file", { id: toastId });
    } finally {
      setIsPromoting(null);
    }
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

  // Expiry date formatter helper
  const getExpiresText = () => {
    if (!file.expiresAt) return null;
    const expiry = new Date(file.expiresAt);
    const diff = expiry.getTime() - Date.now();
    if (diff <= 0) return "Expired";
    return `Expires: ${expiry.toLocaleDateString()}`;
  };

  const expiresText = getExpiresText();

  return (
    <div className="flex flex-col flex-1 gap-6 mx-auto w-full">
      {/* Soft deleted warning banner */}
      {isSoftDeleted && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-600 dark:bg-zinc-900/40 dark:border-zinc-800 dark:text-zinc-400">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">
                This file is in the Recycle Bin
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-0.5">
                Deleted on {new Date(file.deletedAt!).toLocaleDateString()}{" "}
                (Grace period: 30 days before permanent wipe).
              </p>
            </div>
          </div>
          {user.role === "SUPERADMIN" && (
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              onClick={handleRecover}
              disabled={isPending}
            >
              <CornerUpLeft className="size-4 mr-2" /> Recover File
            </Button>
          )}
        </div>
      )}

      {/* Navigation Breadcrumb & Back */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href={`/files?folderPath=${encodeURIComponent(file.folderPath)}`}
          className="flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3" /> Back to Files
        </Link>
        <ChevronRight className="size-3 text-muted-foreground/50" />
        <span className="font-mono text-xs truncate max-w-xs">
          {file.folderPath}
        </span>
      </div>

      {/* Detail Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b pb-6">
        <div className="space-y-3 min-w-0">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-muted/80 text-muted-foreground border">
              <FileIconComponent className="size-6 shrink-0" />
            </div>
            <div className="space-y-1 min-w-0">
              <h1
                className="text-2xl font-bold tracking-tight truncate pr-4"
                title={file.displayName}
              >
                {file.displayName}
              </h1>
              <p className="text-xs text-muted-foreground font-mono truncate">
                {file.id}
              </p>
            </div>
          </div>

          {/* Badges row */}
          <div className="flex flex-wrap gap-2">
            {file.visibility === "PUBLIC" ? (
              <Badge
                variant="secondary"
                className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300 border-none"
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
                className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300 border-none"
              >
                Guest Access
              </Badge>
            )}
            {file.isReadOnly && (
              <Badge
                variant="outline"
                className="border-zinc-300 text-zinc-700 bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:bg-zinc-900/50"
              >
                Read-only
              </Badge>
            )}
            {file.isMentionRestricted && (
              <Badge
                variant="secondary"
                className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300 border-none"
              >
                Gated
              </Badge>
            )}
            {expiresText && (
              <Badge
                variant="secondary"
                className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300 border-none"
              >
                <Calendar className="size-3 mr-1" /> {expiresText}
              </Badge>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-start md:self-center">
          {/* Download button - always shown */}
          <Button asChild className="shadow-xs">
            <a href={`/api/files/${file.id}`} download={file.displayName}>
              <Download className="size-4 mr-2" /> Download
            </a>
          </Button>

          {/* Config Lifecycle settings button */}
          {userCanManage && !isSoftDeleted && (
            <Button variant="outline" onClick={() => setIsConfigOpen(true)}>
              <Settings className="size-4 mr-2" /> Configure
            </Button>
          )}

          {/* Mutating Dropdown Actions */}
          {userCanManage && !isSoftDeleted && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-9 border">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {wrapWithTooltip(
                  <DropdownMenuItem
                    onClick={() => setIsRenameOpen(true)}
                    disabled={isMutateDisabled}
                  >
                    <Edit2 className="size-4 mr-2" /> Rename
                  </DropdownMenuItem>,
                  isMutateDisabled,
                  "File is read-only",
                )}
                {wrapWithTooltip(
                  <DropdownMenuItem
                    onClick={() => setIsMoveOpen(true)}
                    disabled={isMutateDisabled}
                  >
                    <FolderInput className="size-4 mr-2" /> Move
                  </DropdownMenuItem>,
                  isMutateDisabled,
                  "File is read-only",
                )}
                <DropdownMenuItem onClick={() => setIsVisibilityOpen(true)}>
                  <Eye className="size-4 mr-2" /> Visibility
                </DropdownMenuItem>
                {wrapWithTooltip(
                  <DropdownMenuItem
                    onClick={() => setIsReplaceOpen(true)}
                    disabled={isMutateDisabled}
                  >
                    <RefreshCw className="size-4 mr-2" /> Replace Binary
                  </DropdownMenuItem>,
                  isMutateDisabled,
                  "File is read-only",
                )}
                <DropdownMenuSeparator />
                {wrapWithTooltip(
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    onClick={() => setIsDeleteOpen(true)}
                    disabled={isMutateDisabled}
                  >
                    <Trash2 className="size-4 mr-2" /> Delete File
                  </DropdownMenuItem>,
                  isMutateDisabled,
                  "File is read-only",
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Main double column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left Side: Tabs area (Overview / Notes / Sharing) */}
        <div className="lg:col-span-3 space-y-6">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="sharing">Sharing</TabsTrigger>
            </TabsList>

            {/* Overview tab */}
            <TabsContent value="overview" className="space-y-6 outline-hidden">
              {/* Preview Container */}
              <Card className="overflow-hidden">
                <CardHeader className="py-4 border-b">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    File Preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 flex flex-col justify-center min-h-[300px]">
                  {isSoftDeleted ? (
                    <div className="flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                      <AlertTriangle className="size-10 text-zinc-400 mb-2" />
                      <p className="text-sm font-medium">Preview Unavailable</p>
                      <p className="text-xs mt-1">
                        This file is currently in the recycle bin.
                      </p>
                    </div>
                  ) : isPreviewable ? (
                    <div className="w-full flex justify-center">
                      {isImage && (
                        <ImageViewer src={fileSrc} alt={file.displayName} />
                      )}
                      {isVideo && (
                        <VideoPlayer src={fileSrc} alt={file.displayName} />
                      )}
                      {isAudio && (
                        <AudioPlayer src={fileSrc} alt={file.displayName} />
                      )}
                      {isPdf && (
                        <iframe
                          src={`${fileSrc}#toolbar=0`}
                          className="w-full h-[600px] rounded-lg border shadow-xs"
                          title="PDF Preview"
                        />
                      )}
                      {isText && <TextFilePreview fileId={file.id} />}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
                      <FileIconComponent className="size-16 text-muted-foreground/30 mb-3" />
                      <p className="text-sm font-medium">
                        No Preview Available
                      </p>
                      <p className="text-xs mt-1">
                        Downloading this file is recommended for viewing.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Metadata Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <User className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">
                        Owner
                      </p>
                      <p className="text-sm font-medium truncate">
                        {ownerName}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <HardDrive className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">
                        Size
                      </p>
                      <p className="text-sm font-medium">
                        {formatBytes(file.size)}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <FileText className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">
                        MIME Type
                      </p>
                      <p
                        className="text-sm font-medium truncate"
                        title={file.mimeType}
                      >
                        {file.mimeType}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <Calendar className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">
                        Created
                      </p>
                      <p className="text-sm font-medium">
                        {formatRelativeDate(file.createdAt)}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <Calendar className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">
                        Last Modified
                      </p>
                      <p className="text-sm font-medium">
                        {formatRelativeDate(file.updatedAt)}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <FolderInput className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wider">
                        Virtual Path
                      </p>
                      <p
                        className="text-sm font-medium truncate"
                        title={file.folderPath}
                      >
                        {file.folderPath}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Compression & Derivatives Card */}
              <Card className="mt-6">
                <CardHeader className="py-4 border-b">
                  <CardTitle className="text-sm font-semibold flex items-center justify-between">
                    <span>COMPRESSION & DERIVED VERSIONS</span>
                    {parentFile && (
                      <Badge
                        variant="outline"
                        className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300"
                      >
                        Derived Version
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  {parentFile && (
                    <div className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-muted/20">
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Original Source File
                        </p>
                        <Link
                          href={`/files/${parentFile.id}`}
                          className="text-sm font-medium hover:underline text-primary"
                        >
                          {parentFile.displayName}
                        </Link>
                        <p className="text-[10px] text-muted-foreground">
                          {formatBytes(parentFile.size)} • {parentFile.mimeType}
                        </p>
                      </div>
                    </div>
                  )}

                  {derivatives.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Derived Versions
                      </p>
                      <div className="space-y-2.5">
                        {derivatives.map((d) => {
                          const originalSize = BigInt(file.size);
                          const compressedSize = BigInt(d.size);
                          const ratio =
                            originalSize > 0
                              ? (
                                  (1 -
                                    Number(compressedSize) /
                                      Number(originalSize)) *
                                  100
                                ).toFixed(0)
                              : "0";
                          return (
                            <div
                              key={d.id}
                              className="flex items-center justify-between gap-4 p-3.5 rounded-lg border bg-card shadow-xs"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <Link
                                  href={`/files/${d.id}`}
                                  className="text-sm font-medium hover:underline text-foreground block truncate"
                                >
                                  {d.displayName}
                                </Link>
                                <p className="text-[10px] text-muted-foreground">
                                  {formatBytes(compressedSize.toString())} •{" "}
                                  {d.mimeType} •{" "}
                                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                                    Saved {ratio}%
                                  </span>
                                </p>
                              </div>
                              {userCanManage && (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => handlePromote(d.id)}
                                  disabled={
                                    isPromoting !== null || isCompressing
                                  }
                                  className="text-xs h-8 cursor-pointer shrink-0"
                                >
                                  {isPromoting === d.id
                                    ? "Promoting..."
                                    : "Make Canonical"}
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!parentFile && file.mimeType !== "application/gzip" && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-muted-foreground uppercase">
                          Non-Destructive Gzip Compression
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Compress this file server-side to save storage space.
                          The original file remains intact.
                        </p>
                      </div>
                      <Button
                        onClick={handleCompress}
                        disabled={
                          isCompressing ||
                          isPromoting !== null ||
                          isMutateDisabled
                        }
                        className="self-start sm:self-center cursor-pointer shadow-xs gap-1.5"
                      >
                        {isCompressing ? (
                          <>
                            <span className="size-3 animate-spin border-2 border-current border-t-transparent rounded-full" />
                            Queueing...
                          </>
                        ) : (
                          "Compress File"
                        )}
                      </Button>
                    </div>
                  )}
                  {file.mimeType === "application/gzip" && !parentFile && (
                    <p className="text-xs text-muted-foreground italic bg-muted/20 p-3 rounded-lg">
                      This is a compressed gzip file.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notes tab */}
            <TabsContent value="notes" className="outline-hidden space-y-4">
              <div className="flex justify-between items-center bg-muted/30 border p-3 rounded-lg">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-semibold text-foreground">
                    Collaborative Notes
                  </h3>
                  <p className="text-[0.65rem] text-muted-foreground">
                    Shared editing for this document. Ctrl+S to save.
                  </p>
                </div>
                {canViewNoteHistory && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setIsHistoryOpen(true)}
                  >
                    <History className="size-3 mr-1.5" /> Note History
                  </Button>
                )}
              </div>
              <FileNotePanel
                fileId={file.id}
                canViewHistory={false} // Using our dedicated dialog instead of nested tab
                isReadOnly={file.isReadOnly || isSoftDeleted}
                className="w-full"
              />
            </TabsContent>

            {/* Sharing tab */}
            <TabsContent value="sharing" className="outline-hidden">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Share2 className="size-4 text-primary" /> File Access &
                    Sharing
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <FileSharingPanel
                    fileId={file.id}
                    file={file}
                    currentUserRole={user.role}
                    currentUserId={user.id}
                    onOpenVisibility={() => setIsVisibilityOpen(true)}
                    onOpenConfig={() => setIsConfigOpen(true)}
                    onSuccess={handleRefresh}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Side: Collaboration Side-Panel (Tags & Mentions) */}
        <div className="lg:col-span-1 space-y-6 lg:mt-16">
          <Card>
            <CardHeader className="py-4 border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                Collaboration
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-6 divide-y *:pt-6 first:*:pt-0">
              <FileTags
                fileId={file.id}
                initialTags={initialTags}
                isReadOnly={file.isReadOnly || isSoftDeleted}
                canEdit={userCanManage}
              />
              <FileMentions
                fileId={file.id}
                initialMentions={initialMentions}
                isMentionRestricted={file.isMentionRestricted}
                canManageMentions={canViewNoteHistory && !isSoftDeleted}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      {userCanManage && !isSoftDeleted && (
        <>
          <RenameDialog
            isOpen={isRenameOpen}
            onOpenChange={setIsRenameOpen}
            fileId={file.id}
            currentName={file.displayName}
            onSuccess={handleRefresh}
          />
          <MoveDialog
            isOpen={isMoveOpen}
            onOpenChange={setIsMoveOpen}
            fileId={file.id}
            currentFolder={file.folderPath}
            folderPaths={folderPaths}
            onSuccess={handleRefresh}
          />
          <VisibilityDialog
            isOpen={isVisibilityOpen}
            onOpenChange={setIsVisibilityOpen}
            fileId={file.id}
            currentVisibility={file.visibility as "PUBLIC" | "PRIVATE"}
            currentGuestAccess={file.guestAccess}
            onSuccess={handleRefresh}
          />
          <ReplaceFileDialog
            isOpen={isReplaceOpen}
            onOpenChange={setIsReplaceOpen}
            fileId={file.id}
            fileName={file.displayName}
            onSuccess={handleRefresh}
          />
          <FileConfigPanel
            isOpen={isConfigOpen}
            onOpenChange={setIsConfigOpen}
            file={file}
            userRole={user.role}
            onSuccess={handleRefresh}
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

      {/* Standalone History Dialog for Owner/Admin */}
      {canViewNoteHistory && (
        <NoteHistoryDialog
          fileId={file.id}
          isOpen={isHistoryOpen}
          onOpenChange={setIsHistoryOpen}
          canView={canViewNoteHistory}
        />
      )}
    </div>
  );
}
