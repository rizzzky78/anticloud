"use client";

import { useJobs } from "@/components/jobs-context";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Briefcase,
  Clock,
  Activity,
  CheckCircle,
  XCircle,
  AlertOctagon,
  Download,
  Eye,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { formatRelativeDate } from "@/lib/format";
import Link from "next/link";

export function JobsDrawer() {
  const { jobs, isDrawerOpen, setDrawerOpen, clearJobs } = useJobs();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return (
          <Badge variant="outline" className="gap-1 text-[10px] uppercase font-bold tracking-wider py-0.5">
            <Clock className="size-3 text-muted-foreground" /> Pending
          </Badge>
        );
      case "RUNNING":
        return (
          <Badge variant="default" className="bg-sky-600 hover:bg-sky-600 gap-1 text-[10px] uppercase font-bold tracking-wider py-0.5 animate-pulse">
            <Activity className="size-3" /> Running
          </Badge>
        );
      case "COMPLETED":
        return (
          <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600 gap-1 text-[10px] uppercase font-bold tracking-wider py-0.5">
            <CheckCircle className="size-3" /> Completed
          </Badge>
        );
      case "FAILED":
        return (
          <Badge variant="destructive" className="gap-1 text-[10px] uppercase font-bold tracking-wider py-0.5">
            <XCircle className="size-3" /> Failed
          </Badge>
        );
      case "DEAD_LETTER":
        return (
          <Badge variant="destructive" className="bg-rose-950 hover:bg-rose-950 text-rose-200 border-rose-800 gap-1 text-[10px] uppercase font-bold tracking-wider py-0.5">
            <AlertOctagon className="size-3" /> DLQ
          </Badge>
        );
      default:
        return null;
    }
  };

  const getJobTitle = (type: string) => {
    switch (type) {
      case "BULK_ARCHIVE":
        return "Bulk Download Archive";
      case "COMPRESSION":
        return "File Compression";
      case "TTL_EXPIRY":
        return "TTL Expiry Cleanup";
      default:
        return type;
    }
  };

  return (
    <Drawer open={isDrawerOpen} onOpenChange={setDrawerOpen} direction="right">
      <DrawerContent className="h-full border-l bg-background max-w-sm sm:max-w-md w-full ml-auto">
        <div className="flex flex-col h-full">
          <DrawerHeader className="border-b py-4 px-6 flex flex-row items-center justify-between">
            <div className="space-y-0.5 text-left">
              <DrawerTitle className="text-base font-bold flex items-center gap-2">
                <Briefcase className="size-4 text-primary" /> Task Console
              </DrawerTitle>
              <DrawerDescription className="text-xs">
                Monitor and access recent background operations.
              </DrawerDescription>
            </div>
            {jobs.length > 0 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={clearJobs}
                className="text-muted-foreground hover:text-destructive gap-1.5"
              >
                <Trash2 className="size-3.5" /> Clear History
              </Button>
            )}
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground space-y-2">
                <Briefcase className="size-8 text-muted-foreground/30 stroke-[1.5]" />
                <p className="text-sm font-medium">No tasks found</p>
                <p className="text-xs text-muted-foreground/70">
                  Operations like bulk downloads or compression will show up here.
                </p>
              </div>
            ) : (
              jobs.map((job) => (
                <div key={job.id} className="p-4 rounded-lg border bg-card/50 shadow-xs space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-semibold text-foreground">
                        {getJobTitle(job.type)}
                      </h4>
                      <p className="text-[10px] font-mono text-muted-foreground">
                        ID: {job.id.slice(0, 8)}...
                      </p>
                    </div>
                    <div>{getStatusBadge(job.status)}</div>
                  </div>

                  {/* Progress Indicator for pending/running jobs */}
                  {(job.status === "PENDING" || job.status === "RUNNING") && (
                    <div className="space-y-1">
                      <Progress value={job.status === "RUNNING" ? 65 : 15} className="h-1 animate-pulse" />
                      <p className="text-[9px] text-muted-foreground italic">
                        {job.status === "PENDING" ? "Waiting in queue..." : "Processing binary streams..."}
                      </p>
                    </div>
                  )}

                  {/* Completed results action */}
                  {job.status === "COMPLETED" && (
                    <div className="flex items-center gap-2">
                      {job.type === "BULK_ARCHIVE" && job.result?.downloadUrl && (
                        <Button asChild size="sm" className="w-full h-8 text-xs gap-1.5 shadow-xs">
                          <a href={job.result.downloadUrl}>
                            <Download className="size-3.5" /> Download ZIP
                          </a>
                        </Button>
                      )}
                      {job.type === "COMPRESSION" && job.result?.derivedFileId && (
                        <Button asChild variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5" onClick={() => setDrawerOpen(false)}>
                          <Link href={`/files/${job.result.derivedFileId}`}>
                            <Eye className="size-3.5" /> View Compressed File
                          </Link>
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Failed log details */}
                  {(job.status === "FAILED" || job.status === "DEAD_LETTER") && job.error && (
                    <div className="flex items-start gap-1.5 p-2 rounded bg-destructive/10 border border-destructive/20 text-destructive text-[10px] font-mono">
                      <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                      <p className="line-clamp-2 leading-relaxed" title={job.error}>
                        {job.error}
                      </p>
                    </div>
                  )}

                  <div className="text-[9px] text-muted-foreground text-right">
                    Created {formatRelativeDate(job.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
