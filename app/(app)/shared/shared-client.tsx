"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Link2, LogOut, Search, Users, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getFileIcon } from "@/components/file-list-types";
import { formatBytes, formatDate, formatRelativeDate } from "@/lib/format";
import { leaveShare } from "@/actions/roles";
import type { SharedByMeEntry, SharedWithMeEntry } from "@/lib/shares";

const ROLE_LABEL: Record<string, string> = {
  VIEWER: "Viewer",
  EDITOR: "Editor",
  ADMIN: "Manager",
  SUPERADMIN: "Manager",
  GUEST: "Viewer",
};

interface SharedClientProps {
  withMe: SharedWithMeEntry[];
  byMe: SharedByMeEntry[];
}

function FileCell({ id, name, mimeType }: { id: string; name: string; mimeType: string }) {
  const Icon = getFileIcon(mimeType);
  return (
    <Link href={`/files/${id}`} className="flex items-center gap-3 min-w-0 hover:underline">
      <div className="p-2 bg-muted/60 rounded border border-border/40 shrink-0">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <span className="truncate font-medium" title={name}>
        {name}
      </span>
    </Link>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-28 text-center text-sm text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function SharedClient({ withMe, byMe }: SharedClientProps) {
  const [query, setQuery] = useState("");
  const [incoming, setIncoming] = useState(withMe);
  const [isPending, startTransition] = useTransition();

  const q = query.trim().toLowerCase();
  const filteredIncoming = incoming.filter((f) => f.displayName.toLowerCase().includes(q));
  const filteredOutgoing = byMe.filter((f) => f.displayName.toLowerCase().includes(q));

  const handleLeave = (entry: SharedWithMeEntry) => {
    startTransition(async () => {
      try {
        await leaveShare({ fileId: entry.fileId });
        setIncoming((prev) => prev.filter((f) => f.fileId !== entry.fileId));
        toast.success(`Removed "${entry.displayName}" from your shared files`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to remove share");
      }
    });
  };

  return (
    <Tabs defaultValue="with-me" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="with-me">Shared with me ({incoming.length})</TabsTrigger>
          <TabsTrigger value="by-me">Shared by me ({byMe.length})</TabsTrigger>
        </TabsList>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name..."
            className="pl-9"
          />
        </div>
      </div>

      <TabsContent value="with-me">
        <Card className="py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead className="hidden md:table-cell">Shared by</TableHead>
                  <TableHead className="hidden lg:table-cell">Size</TableHead>
                  <TableHead className="hidden sm:table-cell">Shared</TableHead>
                  <TableHead className="text-right w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIncoming.length === 0 ? (
                  <EmptyRow colSpan={6} text="Nothing has been shared with you yet." />
                ) : (
                  filteredIncoming.map((f) => (
                    <TableRow key={f.fileId}>
                      <TableCell className="max-w-[280px]">
                        <FileCell id={f.fileId} name={f.displayName} mimeType={f.mimeType} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="secondary" className="text-[10px]">
                            {ROLE_LABEL[f.role] ?? f.role}
                          </Badge>
                          {f.viaGroup && (
                            <Badge variant="outline" className="gap-1 text-[10px]">
                              <Users className="size-3" /> {f.viaGroup}
                            </Badge>
                          )}
                          {f.expiresAt && (
                            <Badge variant="outline" className="text-[10px]">
                              until {formatDate(f.expiresAt)}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {f.sharedBy ?? f.owner ?? "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        {formatBytes(f.size)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {formatRelativeDate(f.sharedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {!f.viaGroup && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          title="Remove from my shared files"
                          disabled={isPending}
                          onClick={() => handleLeave(f)}
                        >
                          <LogOut className="size-4" />
                        </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="by-me">
        <Card className="py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Shared with</TableHead>
                  <TableHead className="hidden lg:table-cell">Size</TableHead>
                  <TableHead className="hidden sm:table-cell">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOutgoing.length === 0 ? (
                  <EmptyRow colSpan={4} text="You are not sharing any files." />
                ) : (
                  filteredOutgoing.map((f) => (
                    <TableRow key={f.fileId}>
                      <TableCell className="max-w-[320px]">
                        <FileCell id={f.fileId} name={f.displayName} mimeType={f.mimeType} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {f.people > 0 && (
                            <Badge variant="secondary" className="gap-1 text-[10px]">
                              <Users className="size-3" /> {plural(f.people, "person", "people")}
                            </Badge>
                          )}
                          {f.groups > 0 && (
                            <Badge variant="secondary" className="gap-1 text-[10px]">
                              <UsersRound className="size-3" /> {plural(f.groups, "group", "groups")}
                            </Badge>
                          )}
                          {f.activeLinks > 0 && (
                            <Badge variant="outline" className="gap-1 text-[10px]">
                              <Link2 className="size-3" /> {plural(f.activeLinks, "link", "links")}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        {formatBytes(f.size)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {formatRelativeDate(f.updatedAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
