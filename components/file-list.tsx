"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FolderIcon, UploadCloud, Download } from "lucide-react";
import { FileBucket, FileListEntry } from "@/lib/file-list";
import { FileRow } from "@/components/file-row";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { UploadDialog } from "@/components/upload-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useJobs } from "@/components/jobs-context";
import { toast } from "sonner";

interface FileListProps {
  buckets?: FileBucket[];
  subfolders?: string[];
  folderPaths?: string[];
  userId?: string;
  userRole?: string;
  currentFolderPath?: string;
  files?: any[];
}

export function FileList({
  buckets: propBuckets = [],
  subfolders = [],
  folderPaths = [],
  userId = "",
  userRole = "",
  currentFolderPath = "",
  files,
}: FileListProps) {
  const router = useRouter();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const { addJob } = useJobs();

  const handleSelectChange = (fileId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(fileId);
      } else {
        next.delete(fileId);
      }
      return next;
    });
  };

  const handleSelectAll = (bucketFiles: FileListEntry[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      bucketFiles.forEach((file) => {
        if (checked) {
          next.add(file.id);
        } else {
          next.delete(file.id);
        }
      });
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkDownload = async () => {
    if (selectedIds.size === 0) return;
    setIsDownloading(true);
    const toastId = toast.loading(`Preparing bulk download for ${selectedIds.size} files...`);

    try {
      const res = await fetch("/api/files/bulk-download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileIds: Array.from(selectedIds),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Bulk download failed");
      }

      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (data.async && data.jobId) {
          addJob(data.jobId);
          toast.success("Download job enqueued!", {
            id: toastId,
            description: "Track progress in your task console.",
          });
          clearSelection();
        } else {
          toast.error("Invalid response from server", { id: toastId });
        }
      } else {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "archive.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        toast.success("Download started!", { id: toastId });
        clearSelection();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to download files", { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  };

  const getFolderName = (path: string) => {
    const segments = path.split("/").filter(Boolean);
    return segments[segments.length - 1] || path;
  };

  const buckets = files
    ? [{ key: "results", label: `Search Results (${files.length})`, files: files as any }]
    : propBuckets;

  const hasContent = buckets.some((b) => b.files.length > 0) || subfolders.length > 0;

  const handleSuccess = () => {
    router.refresh();
  };

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-12">
        <EmptyState
          icon={<FolderIcon className="size-10 text-muted-foreground" />}
          title={currentFolderPath === "/" ? "No files yet" : `No files in ${getFolderName(currentFolderPath)}`}
          description="Upload a file or create a folder to get started."
        >
          <Button onClick={() => setIsUploadOpen(true)} className="mt-4 gap-2">
            <UploadCloud className="size-4" /> Upload File
          </Button>
        </EmptyState>

        <UploadDialog
          isOpen={isUploadOpen}
          onOpenChange={setIsUploadOpen}
          currentFolderPath={currentFolderPath}
          onSuccess={handleSuccess}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Folders Section */}
      {subfolders.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Folders
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {subfolders.map((path) => {
              const folderName = getFolderName(path);
              return (
                <Link
                  key={path}
                  href={`/files?folderPath=${encodeURIComponent(path)}`}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/40 active:bg-accent/60 transition-colors shadow-sm"
                >
                  <div className="p-2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <FolderIcon className="size-4 shrink-0" />
                  </div>
                  <span className="text-sm font-medium truncate" title={folderName}>
                    {folderName}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Files Section */}
      {buckets.map((bucket) => {
        if (bucket.files.length === 0) return null;
        return (
          <div key={bucket.key} className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {bucket.label}
            </h2>
            <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px] p-4 py-3">
                      <Checkbox
                        checked={
                          bucket.files.length > 0 &&
                          bucket.files.every((f) => selectedIds.has(f.id))
                        }
                        onCheckedChange={(checked) => handleSelectAll(bucket.files, !!checked)}
                        aria-label="Select all files in this section"
                      />
                    </TableHead>
                    <TableHead className="w-[45%] p-4 py-3">Name</TableHead>
                    <TableHead className="hidden sm:table-cell py-3">Size</TableHead>
                    <TableHead className="hidden md:table-cell py-3">Access</TableHead>
                    <TableHead className="hidden lg:table-cell py-3">Created</TableHead>
                    <TableHead className="w-[10%] py-3 text-right p-4"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bucket.files.map((file: FileListEntry) => (
                    <FileRow
                      key={file.id}
                      file={file}
                      userId={userId}
                      userRole={userRole}
                      folderPaths={folderPaths}
                      onSuccess={handleSuccess}
                      isSelected={selectedIds.has(file.id)}
                      onSelectChange={(checked) => handleSelectChange(file.id, checked)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );
      })}

      <UploadDialog
        isOpen={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        currentFolderPath={currentFolderPath}
        onSuccess={handleSuccess}
      />

      {/* Floating Selection Toolbar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 bg-background/85 dark:bg-card/85 backdrop-blur-md px-6 py-3.5 rounded-full border shadow-xl animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size} {selectedIds.size === 1 ? "file" : "files"} selected
            </span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={clearSelection}
              disabled={isDownloading}
              className="text-xs h-8 px-3 rounded-full cursor-pointer hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="xs"
              onClick={handleBulkDownload}
              disabled={isDownloading}
              className="text-xs h-8 px-4 rounded-full cursor-pointer shadow-md bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
            >
              {isDownloading ? (
                <>
                  <span className="size-3 animate-spin border-2 border-current border-t-transparent rounded-full" />
                  Processing...
                </>
              ) : (
                <>
                  <Download className="size-3.5" /> Download
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

