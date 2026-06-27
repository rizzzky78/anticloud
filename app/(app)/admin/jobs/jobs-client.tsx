"use client";

import { useState } from "react";
import {
  Activity,
  Briefcase,
  AlertOctagon,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  AlertTriangle,
  Layers,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRelativeDate } from "@/lib/format";
import { JobType, JobStatus } from "@prisma/client";

interface JobItem {
  id: string;
  type: JobType;
  status: JobStatus;
  payload: any;
  attempts: number;
  maxAttempts: number;
  result: any;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JobsClientProps {
  initialJobs: JobItem[];
  queueDepth: number;
  cacheHitRate: number;
}

export function JobsClient({
  initialJobs,
  queueDepth,
  cacheHitRate,
}: JobsClientProps) {
  const [jobs, setJobs] = useState<JobItem[]>(initialJobs);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedJob, setSelectedJob] = useState<JobItem | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");

  const dlqCount = jobs.filter((j) => j.status === "DEAD_LETTER").length;
  const runningCount = jobs.filter((j) => j.status === "RUNNING").length;
  const failedCount = jobs.filter((j) => j.status === "FAILED").length;

  // Filter jobs by search and status tab
  const filteredJobs = jobs.filter((j) => {
    // Status tab filter
    if (activeTab === "pending" && j.status !== "PENDING") return false;
    if (activeTab === "running" && j.status !== "RUNNING") return false;
    if (activeTab === "completed" && j.status !== "COMPLETED") return false;
    if (activeTab === "failed" && j.status !== "FAILED") return false;
    if (activeTab === "dlq" && j.status !== "DEAD_LETTER") return false;

    // Search term filter
    const term = searchTerm.toLowerCase();
    return (
      j.id.toLowerCase().includes(term) ||
      j.type.toLowerCase().includes(term) ||
      (j.error && j.error.toLowerCase().includes(term))
    );
  });

  const getStatusBadge = (status: JobStatus) => {
    switch (status) {
      case "PENDING":
        return (
          <Badge
            variant="outline"
            className="gap-1 text-[10px] uppercase font-bold tracking-wider py-0.5"
          >
            <Clock className="size-3 text-muted-foreground" /> Pending
          </Badge>
        );
      case "RUNNING":
        return (
          <Badge
            variant="outline"
            className="gap-1 text-[10px] uppercase font-bold tracking-wider py-0.5 animate-pulse bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            <Activity className="size-3" /> Running
          </Badge>
        );
      case "COMPLETED":
        return (
          <Badge
            variant="outline"
            className="gap-1 text-[10px] uppercase font-bold tracking-wider py-0.5 bg-zinc-50 border-zinc-200 text-zinc-700 dark:bg-zinc-900/50 dark:border-zinc-800 dark:text-zinc-300"
          >
            <CheckCircle className="size-3" /> Completed
          </Badge>
        );
      case "FAILED":
        return (
          <Badge
            variant="outline"
            className="gap-1 text-[10px] uppercase font-bold tracking-wider py-0.5 border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-400"
          >
            <XCircle className="size-3" /> Failed
          </Badge>
        );
      case "DEAD_LETTER":
        return (
          <Badge
            variant="outline"
            className="gap-1 text-[10px] uppercase font-bold tracking-wider py-0.5 border-zinc-400 text-zinc-800 bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:bg-zinc-900"
          >
            <AlertOctagon className="size-3" /> DLQ (Dead)
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Metrics Section */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border border-border/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              System Telemetry
            </CardTitle>
            <Layers className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold space-y-1">
              <div>
                Queue Depth:{" "}
                <span className="font-mono text-primary">{queueDepth}</span>{" "}
                jobs
              </div>
              <div className="text-sm text-muted-foreground font-normal">
                Cache Hit Rate:{" "}
                <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                  {cacheHitRate.toFixed(1)}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Workers
            </CardTitle>
            <Activity className="size-4 text-zinc-400 dark:text-zinc-500 animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{runningCount} Running</div>
            <p className="text-xs text-muted-foreground mt-1">
              Active background execution threads
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Dead Letter Queue
            </CardTitle>
            <AlertTriangle
              className={
                dlqCount > 0
                  ? "size-4 text-zinc-800 dark:text-zinc-200 animate-pulse"
                  : "size-4 text-muted-foreground/60"
              }
            />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-zinc-800 dark:text-zinc-200">
              {dlqCount} Failures
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Jobs requiring superadmin intervention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center relative w-full sm:max-w-sm">
            <Search className="absolute left-3 size-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs by ID, type or error..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 border-0"
            />
          </div>
        </div>

        <Card className="border border-border/80 shadow-md">
          <Tabs
            defaultValue="all"
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <CardHeader className="pb-3 border-b border-border/50">
              <TabsList className="grid grid-cols-6 w-full max-w-[650px] h-9">
                <TabsTrigger value="all" className="text-[11px]">
                  All
                </TabsTrigger>
                <TabsTrigger value="pending" className="text-[11px]">
                  Pending
                </TabsTrigger>
                <TabsTrigger value="running" className="text-[11px]">
                  Running
                  {runningCount > 0 && (
                    <span className="ml-1 size-1.5 rounded-full bg-zinc-800 dark:bg-zinc-200 animate-pulse" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="completed" className="text-[11px]">
                  Completed
                </TabsTrigger>
                <TabsTrigger value="failed" className="text-[11px]">
                  Failed
                  {failedCount > 0 && (
                    <Badge
                      variant="outline"
                      className="ml-1 h-4 px-1 text-[9px] border-zinc-400 text-zinc-700 font-bold bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:bg-zinc-900/50"
                    >
                      {failedCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="dlq" className="text-[11px]">
                  DLQ
                  {dlqCount > 0 && (
                    <Badge
                      variant="outline"
                      className="ml-1 h-4 px-1 text-[9px] border-zinc-400 text-zinc-700 font-bold bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:bg-zinc-900/50"
                    >
                      {dlqCount}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="">
                  <TableRow>
                    <TableHead className="w-[140px]">Job ID</TableHead>
                    <TableHead>Job Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead className="max-w-[250px]">
                      Error Message
                    </TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right w-[100px]">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-32 pt-8 text-center text-muted-foreground"
                      >
                        <div className="flex flex-col items-center justify-center space-y-1">
                          <Briefcase className="size-8 text-muted-foreground/30 stroke-[1.5]" />
                          <span className="text-sm font-medium">
                            No background jobs found
                          </span>
                          <span className="text-xs text-muted-foreground/80">
                            No jobs match the current filter.
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredJobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-mono text-xs font-semibold text-muted-foreground truncate">
                          {job.id.slice(0, 12)}...
                        </TableCell>
                        <TableCell className="text-sm font-semibold tracking-wide">
                          {job.type}
                        </TableCell>
                        <TableCell>{getStatusBadge(job.status)}</TableCell>
                        <TableCell className="text-sm">
                          <span
                            className={
                              job.attempts >= job.maxAttempts
                                ? "text-zinc-800 dark:text-zinc-200 font-bold"
                                : "text-muted-foreground"
                            }
                          >
                            {job.attempts}
                          </span>{" "}
                          / {job.maxAttempts}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-600 dark:text-zinc-400 max-w-[250px] truncate font-mono">
                          {job.error || (
                            <span className="text-muted-foreground/50 italic font-sans">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatRelativeDate(job.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedJob(job)}
                            className="h-8 w-8 cursor-pointer hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <Eye className="size-4" />
                            <span className="sr-only">Inspect Job</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Tabs>
        </Card>
      </div>

      {/* Drawer for Inspecting Job details */}
      <Sheet
        open={selectedJob !== null}
        onOpenChange={(open) => !open && setSelectedJob(null)}
      >
        {selectedJob && (
          <SheetContent className="sm:max-w-xl overflow-y-auto">
            <SheetHeader className="space-y-1.5 pb-4 border-b border-border/80">
              <SheetTitle className="text-lg font-bold flex items-center gap-2">
                <Briefcase className="size-5 text-primary" /> Inspect Job
                Details
              </SheetTitle>
              <SheetDescription className="font-mono text-xs">
                ID: {selectedJob.id}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 py-6">
              {/* Status and Type Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Job Type
                  </span>
                  <p className="text-sm font-semibold">{selectedJob.type}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Status
                  </span>
                  <div>{getStatusBadge(selectedJob.status)}</div>
                </div>
              </div>

              {/* Attempts and Timestamps */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Attempts
                  </span>
                  <p className="text-sm">
                    <strong>{selectedJob.attempts}</strong> of{" "}
                    <strong>{selectedJob.maxAttempts}</strong> maximum
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Created At
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {new Date(selectedJob.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Lifecycle Timings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Started At
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {selectedJob.startedAt
                      ? new Date(selectedJob.startedAt).toLocaleString()
                      : "—"}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Completed At
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {selectedJob.completedAt
                      ? new Date(selectedJob.completedAt).toLocaleString()
                      : "—"}
                  </p>
                </div>
              </div>

              {/* Error Trace if any */}
              {selectedJob.error && (
                <div className="space-y-1.5 p-3 rounded bg-zinc-50 border border-zinc-200 text-zinc-600 dark:bg-zinc-900/40 dark:border-zinc-800 dark:text-zinc-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <XCircle className="size-3.5" /> Error Log
                  </span>
                  <p className="text-xs font-mono whitespace-pre-wrap leading-relaxed">
                    {selectedJob.error}
                  </p>
                </div>
              )}

              {/* JSON Payload */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Payload JSON
                </span>
                <div className="rounded bg-muted/60 border border-border/60 p-4 overflow-x-auto max-h-[200px]">
                  <pre className="text-xs font-mono text-foreground leading-normal">
                    {JSON.stringify(selectedJob.payload, null, 2)}
                  </pre>
                </div>
              </div>

              {/* JSON Result */}
              {selectedJob.result && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Result JSON
                  </span>
                  <div className="rounded bg-muted/60 border border-border/60 p-4 overflow-x-auto max-h-[200px]">
                    <pre className="text-xs font-mono text-foreground leading-normal">
                      {JSON.stringify(selectedJob.result, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}
