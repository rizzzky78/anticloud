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
import { FolderIcon, UploadCloud } from "lucide-react";
import { FileBucket, FileListEntry } from "@/lib/file-list";
import { FileRow } from "@/components/file-row";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { UploadDialog } from "@/components/upload-dialog";

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
    </div>
  );
}

