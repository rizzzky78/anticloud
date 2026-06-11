"use client";

import { useState, useTransition } from "react";
import {
  FileText,
  Search,
  Filter,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  Info,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatRelativeDate } from "@/lib/format";
import { getAuditLogs } from "@/actions/audit";
import { toast } from "sonner";

interface AuditLogItem {
  id: string;
  actorId: string | null;
  actor: {
    id: string;
    name: string;
    email: string;
    username: string | null;
    image: string | null;
  } | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  metadata: any;
  createdAt: string;
}

interface AuditClientProps {
  initialLogs: AuditLogItem[];
  initialTotal: number;
  initialTotalPages: number;
  initialActionTypes: string[];
}

export function AuditClient({
  initialLogs,
  initialTotal,
  initialTotalPages,
  initialActionTypes,
}: AuditClientProps) {
  const [logs, setLogs] = useState<AuditLogItem[]>(initialLogs);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [page, setPage] = useState(1);

  // Filters state
  const [actorQuery, setActorQuery] = useState("");
  const [targetId, setTargetId] = useState("");
  const [action, setAction] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSearch = (targetPage = 1) => {
    startTransition(async () => {
      try {
        const result = await getAuditLogs({
          actorQuery: actorQuery.trim() || undefined,
          targetId: targetId.trim() || undefined,
          action: action === "all" ? undefined : action,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          page: targetPage,
          limit: 25,
        });

        setLogs(result.logs as any);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        setPage(targetPage);
      } catch (err: any) {
        toast.error(err.message || "Failed to search audit logs");
      }
    });
  };

  const handleClearFilters = () => {
    setActorQuery("");
    setTargetId("");
    setAction("all");
    setStartDate("");
    setEndDate("");
    
    // Trigger search with cleared values
    startTransition(async () => {
      try {
        const result = await getAuditLogs({
          page: 1,
          limit: 25,
        });
        setLogs(result.logs as any);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        setPage(1);
        toast.success("Filters cleared");
      } catch (err: any) {
        toast.error("Failed to clear filters");
      }
    });
  };

  const getActionBadge = (actionName: string) => {
    if (actionName.startsWith("file.upload") || actionName.startsWith("file.compress")) {
      return (
        <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600 text-[10px] font-bold py-0.5 uppercase tracking-wide">
          {actionName}
        </Badge>
      );
    }
    if (actionName.startsWith("file.download") || actionName.startsWith("file.permanent_url_serve")) {
      return (
        <Badge variant="secondary" className="bg-blue-600 hover:bg-blue-600 text-white text-[10px] font-bold py-0.5 uppercase tracking-wide">
          {actionName}
        </Badge>
      );
    }
    if (actionName.startsWith("role.")) {
      return (
        <Badge variant="default" className="bg-purple-600 hover:bg-purple-600 text-[10px] font-bold py-0.5 uppercase tracking-wide">
          {actionName}
        </Badge>
      );
    }
    if (actionName.startsWith("file.soft_delete") || actionName.startsWith("file.revoke")) {
      return (
        <Badge variant="destructive" className="text-[10px] font-bold py-0.5 uppercase tracking-wide">
          {actionName}
        </Badge>
      );
    }
    if (actionName.startsWith("file.recover")) {
      return (
        <Badge variant="default" className="bg-amber-600 hover:bg-amber-600 text-[10px] font-bold py-0.5 uppercase tracking-wide">
          {actionName}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[10px] font-bold py-0.5 uppercase tracking-wide">
        {actionName}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filtering Surface */}
      <Card className="border border-border/80 shadow-sm bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Filter className="size-4 text-primary" /> Query Filter Engine
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {/* Actor search */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Actor</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Name, email, username..."
                  value={actorQuery}
                  onChange={(e) => setActorQuery(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>

            {/* Target ID search */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Target ID</label>
              <Input
                placeholder="UUID or object key..."
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Action Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Action Type</label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {initialActionTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Start Date</label>
              <div className="relative">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-9 text-sm text-muted-foreground font-medium pr-3"
                />
              </div>
            </div>

            {/* End Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">End Date</label>
              <div className="relative">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-9 text-sm text-muted-foreground font-medium pr-3"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border/40">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearFilters}
              disabled={isPending}
              className="cursor-pointer h-8 text-xs gap-1"
            >
              <X className="size-3.5" /> Clear Filters
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => handleSearch(1)}
              disabled={isPending}
              className="cursor-pointer h-8 text-xs gap-1"
            >
              <Search className="size-3.5" /> Query Logs
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card className="border border-border/80 shadow-md">
        <CardContent className="p-0">
          <div className="relative overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="max-w-[200px] truncate">Target ID</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead className="text-right w-[100px]">Inspect</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <TableRow key={idx} className="animate-pulse">
                      <TableCell colSpan={6} className="h-12 text-center">
                        <div className="h-4 bg-muted/60 rounded w-5/6 mx-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center space-y-1 text-muted-foreground">
                        <FileText className="size-8 text-muted-foreground/30 stroke-[1.5] mb-1" />
                        <span className="text-sm font-semibold">No audit logs found</span>
                        <span className="text-xs text-muted-foreground/80">
                          Try adjusting your filters or date ranges.
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                        <span className="block text-[10px] opacity-70">
                          ({formatRelativeDate(log.createdAt)})
                        </span>
                      </TableCell>
                      <TableCell>
                        {log.actor ? (
                          <div>
                            <span className="text-sm font-semibold block text-foreground">
                              {log.actor.name}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              @{log.actor.username || log.actor.email.split("@")[0]}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/60 italic font-mono">
                            Guest / System
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{getActionBadge(log.action)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                        {log.targetId ? (
                          <span title={log.targetId}>
                            {log.targetType ? `${log.targetType}:` : ""}
                            {log.targetId.slice(0, 18)}
                            {log.targetId.length > 18 && "..."}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 italic font-sans">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.ip || <span className="text-muted-foreground/40 italic font-sans">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedLog(log)}
                          className="h-8 w-8 cursor-pointer hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          <Eye className="size-4" />
                          <span className="sr-only">Inspect log</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-4 border-t border-border/40">
              <span className="text-xs text-muted-foreground">
                Showing logs {page * 25 - 24} - {Math.min(page * 25, total)} of {total}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page === 1 || isPending}
                  onClick={() => handleSearch(page - 1)}
                  className="h-8 w-8 cursor-pointer"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-xs font-semibold px-2">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page === totalPages || isPending}
                  onClick={() => handleSearch(page + 1)}
                  className="h-8 w-8 cursor-pointer"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metadata Inspector Dialog */}
      <Dialog open={selectedLog !== null} onOpenChange={(open) => !open && setSelectedLog(null)}>
        {selectedLog && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="pb-3 border-b border-border/80">
              <DialogTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-wide">
                <Info className="size-4 text-primary" /> Inspect Metadata
              </DialogTitle>
              <DialogDescription className="font-mono text-[10px]">
                ID: {selectedLog.id}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="font-bold text-muted-foreground block">Action</span>
                  <span className="font-semibold text-foreground">{selectedLog.action}</span>
                </div>
                <div>
                  <span className="font-bold text-muted-foreground block">Target Type</span>
                  <span className="font-semibold text-foreground">{selectedLog.targetType || "—"}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Payload Metadata
                </span>
                <div className="rounded bg-muted/60 border border-border/60 p-4 max-h-[200px] overflow-y-auto">
                  <pre className="text-xs font-mono text-foreground leading-normal whitespace-pre-wrap">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
