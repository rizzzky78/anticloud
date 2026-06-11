"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, RotateCcw, Loader2, FileIcon, Trash2, Clock } from "lucide-react";
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
import { recoverFile } from "@/actions/file-config";
import { formatBytes, formatDate } from "@/lib/format";

interface DeletedFileItem {
  id: string;
  displayName: string;
  mimeType: string;
  size: string;
  deletedAt: string;
  owner: { name: string; email: string } | null;
}

interface RecycleBinClientProps {
  initialFiles: DeletedFileItem[];
}

export function RecycleBinClient({ initialFiles }: RecycleBinClientProps) {
  const router = useRouter();
  const [files, setFiles] = useState<DeletedFileItem[]>(initialFiles);
  const [searchTerm, setSearchTerm] = useState("");
  const [isPending, startTransition] = useTransition();

  // Filter files by search term
  const filteredFiles = files.filter((f) =>
    f.displayName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRemainingTime = (deletedAtStr: string) => {
    const GRACE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
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
      return { text: `${hours} ${hours === 1 ? "hour" : "hours"} left`, variant: "destructive" as const };
    }

    return { text: "< 1 hour left", variant: "destructive" as const };
  };

  const handleRestore = (fileId: string, displayName: string) => {
    startTransition(async () => {
      try {
        await recoverFile({ fileId });
        
        // Remove from local list
        setFiles((prev) => prev.filter((f) => f.id !== fileId));
        
        toast.success(`Successfully restored "${displayName}"`);
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message || "Failed to restore file");
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

      <Card className="border border-border/80 shadow-md">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[300px]">File Name</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Deleted At</TableHead>
                <TableHead>Time Remaining</TableHead>
                <TableHead>Original Owner</TableHead>
                <TableHead className="text-right w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-1">
                      <Trash2 className="size-8 text-muted-foreground/30 stroke-[1.5]" />
                      <span className="text-sm font-medium">Recycle bin is empty</span>
                      <span className="text-xs text-muted-foreground/80">
                        No soft-deleted files were found.
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredFiles.map((file) => {
                  const remaining = getRemainingTime(file.deletedAt);
                  return (
                    <TableRow key={file.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-muted/60 rounded border border-border/40">
                            <FileIcon className="size-4 text-muted-foreground" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="truncate" title={file.displayName}>
                              {file.displayName}
                            </span>
                            <span className="text-[10px] text-muted-foreground truncate font-mono">
                              {file.mimeType}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatBytes(file.size)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(file.deletedAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={remaining.variant} className="gap-1 text-[10px] uppercase font-bold tracking-wider py-0.5">
                          <Clock className="size-3" />
                          {remaining.text}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {file.owner ? (
                          <div className="flex flex-col">
                            <span className="text-foreground text-xs font-medium">{file.owner.name}</span>
                            <span className="text-[10px]">{file.owner.email}</span>
                          </div>
                        ) : (
                          <span className="italic text-xs">System / Unowned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleRestore(file.id, file.displayName)}
                          disabled={isPending}
                          className="h-8 gap-1.5 cursor-pointer text-primary border-primary/20 hover:bg-primary/5 hover:text-primary"
                        >
                          {isPending ? (
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
