"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, RotateCcw, Loader2, Trash2, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { restoreFile } from "@/actions/file-config";
import { getFileIcon } from "@/components/file-list-types";
import { formatBytes, formatDate } from "@/lib/format";
import type { DeletedFileEntry } from "@/lib/file-list";

interface TrashClientProps {
  initialFiles: DeletedFileEntry[];
}

const GRACE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function getRemainingTime(deletedAtStr: string) {
  const deletedTime = new Date(deletedAtStr).getTime();
  const remainingMs = GRACE_WINDOW_MS - (Date.now() - deletedTime);

  if (remainingMs <= 0) {
    return { text: "Expired", variant: "destructive" as const };
  }

  const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
  if (days > 0) {
    return {
      text: `${days} ${days === 1 ? "day" : "days"} left`,
      variant: days < 7 ? ("destructive" as const) : ("secondary" as const),
    };
  }

  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  if (hours > 0) {
    return {
      text: `${hours} ${hours === 1 ? "hour" : "hours"} left`,
      variant: "destructive" as const,
    };
  }

  return { text: "< 1 hour left", variant: "destructive" as const };
}

export function TrashClient({ initialFiles }: TrashClientProps) {
  const router = useRouter();
  const [files, setFiles] = useState<DeletedFileEntry[]>(initialFiles);
  const [searchTerm, setSearchTerm] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredFiles = files.filter((f) =>
    f.displayName.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleRestore = (fileId: string, displayName: string) => {
    setRestoringId(fileId);
    startTransition(async () => {
      try {
        await restoreFile({ fileId });
        setFiles((prev) => prev.filter((f) => f.id !== fileId));
        toast.success(`Restored "${displayName}"`);
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message || "Failed to restore file");
      } finally {
        setRestoringId(null);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center relative max-w-sm">
        <Search className="absolute left-3 size-4 text-muted-foreground" />
        <Input
          placeholder="Search deleted files by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card className="border border-border/80 shadow-md py-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="">
              <TableRow>
                <TableHead className="w-[320px]">File Name</TableHead>
                <TableHead className="hidden sm:table-cell">Size</TableHead>
                <TableHead className="hidden md:table-cell">Deleted</TableHead>
                <TableHead>Time Remaining</TableHead>
                <TableHead className="text-right w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFiles.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-40 text-center text-muted-foreground"
                  >
                    <div className="flex flex-col items-center justify-center space-y-1">
                      <Trash2 className="size-8 text-muted-foreground/30 stroke-[1.5]" />
                      <span className="text-sm font-medium">
                        {searchTerm
                          ? "No matching deleted files"
                          : "Recycle bin is empty"}
                      </span>
                      <span className="text-xs text-muted-foreground/80">
                        Deleted files appear here for 30 days.
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredFiles.map((file) => {
                  const remaining = getRemainingTime(file.deletedAt);
                  const FileIconComponent = getFileIcon(file.mimeType);
                  const isRestoring = restoringId === file.id;
                  return (
                    <TableRow key={file.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-muted/60 rounded border border-border/40">
                            <FileIconComponent className="size-4 text-muted-foreground" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="truncate" title={file.displayName}>
                              {file.displayName}
                            </span>
                            <span className="text-[10px] text-muted-foreground truncate font-mono">
                              {file.folderPath}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">
                        {formatBytes(file.size)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {formatDate(file.deletedAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={remaining.variant}
                          className="gap-1 text-[10px] uppercase font-bold tracking-wider py-0.5"
                        >
                          <Clock className="size-3" />
                          {remaining.text}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() =>
                            handleRestore(file.id, file.displayName)
                          }
                          disabled={isPending}
                          className="h-8 gap-1.5 cursor-pointer text-primary border-primary/20 hover:bg-primary/5 hover:text-primary"
                        >
                          {isRestoring ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3.5" />
                          )}
                          Restore
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
