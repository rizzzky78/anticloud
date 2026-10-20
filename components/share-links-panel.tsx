"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, Copy, KeyRound, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { formatDate, formatRelativeDate } from "@/lib/format";
import {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  type ShareLinkItem,
} from "@/actions/share-links";

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never expires" },
  { value: "1", label: "1 day" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

function linkStatus(link: ShareLinkItem): { label: string; active: boolean } {
  if (link.revokedAt) return { label: "Revoked", active: false };
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) {
    return { label: "Expired", active: false };
  }
  if (link.maxDownloads !== null && link.downloadCount >= link.maxDownloads) {
    return { label: "Limit reached", active: false };
  }
  return { label: "Active", active: true };
}

/** Create, copy, and revoke public share links for one file (managers only). */
export function ShareLinksPanel({ fileId }: { fileId: string }) {
  const [links, setLinks] = useState<ShareLinkItem[] | null>(null);
  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState("7");
  const [password, setPassword] = useState("");
  const [maxDownloads, setMaxDownloads] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ShareLinkItem | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    try {
      setLinks(await listShareLinks({ fileId }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load share links");
      setLinks([]);
    }
  }, [fileId]);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async (link: ShareLinkItem) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const handleCreate = () => {
    const limit = maxDownloads.trim() ? Number(maxDownloads) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      toast.error("Download limit must be a positive whole number");
      return;
    }
    startTransition(async () => {
      try {
        const expiresAt =
          expiry === "never"
            ? null
            : new Date(Date.now() + Number(expiry) * 24 * 60 * 60 * 1000).toISOString();
        const link = await createShareLink({
          fileId,
          label: label || undefined,
          expiresAt,
          password: password || undefined,
          maxDownloads: limit,
        });
        setLinks((prev) => [link, ...(prev ?? [])]);
        setLabel("");
        setPassword("");
        setMaxDownloads("");
        await copy(link);
        toast.success("Share link created and copied");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create link");
      }
    });
  };

  const handleRevoke = () => {
    if (!revokeTarget) return;
    startTransition(async () => {
      try {
        await revokeShareLink({ linkId: revokeTarget.id });
        toast.success("Link revoked");
        setRevokeTarget(null);
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to revoke link");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <Link2 className="size-4 text-primary" /> Share by link
        </h4>
        <p className="text-xs text-muted-foreground">
          Anyone with the link can view and download this file without an account.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="link-label" className="text-xs">Label (optional)</Label>
            <Input
              id="link-label"
              value={label}
              maxLength={80}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Vendor review"
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Expiry</Label>
            <Select value={expiry} onValueChange={setExpiry} disabled={isPending}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="link-password" className="text-xs">Password (optional)</Label>
            <Input
              id="link-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 4 characters"
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="link-limit" className="text-xs">Download limit (optional)</Label>
            <Input
              id="link-limit"
              type="number"
              min={1}
              value={maxDownloads}
              onChange={(e) => setMaxDownloads(e.target.value)}
              placeholder="Unlimited"
              disabled={isPending}
            />
          </div>
        </div>
        <Button onClick={handleCreate} disabled={isPending} className="w-full sm:w-auto">
          {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
          Create link
        </Button>
      </div>

      {links === null ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading links…
        </div>
      ) : links.length > 0 ? (
        <ul className="divide-y rounded-xl border">
          {links.map((link) => {
            const status = linkStatus(link);
            return (
              <li key={link.id} className="flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-xs font-semibold">
                      {link.label || "Share link"}
                    </span>
                    <Badge variant={status.active ? "secondary" : "outline"} className="text-[10px]">
                      {status.label}
                    </Badge>
                    {link.hasPassword && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <KeyRound className="size-3" /> Password
                      </Badge>
                    )}
                  </div>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">{link.url}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {link.downloadCount}
                    {link.maxDownloads !== null ? ` / ${link.maxDownloads}` : ""} downloads
                    {link.expiresAt ? ` · expires ${formatDate(link.expiresAt)}` : ""}
                    {` · created ${formatRelativeDate(link.createdAt)}`}
                    {link.createdBy ? ` by ${link.createdBy}` : ""}
                  </p>
                </div>
                {status.active && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => copy(link)}
                      title="Copy link"
                    >
                      {copiedId === link.id ? <Check className="size-4" /> : <Copy className="size-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setRevokeTarget(link)}
                      disabled={isPending}
                      title="Revoke link"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke share link?</AlertDialogTitle>
            <AlertDialogDescription>
              Anyone using this link will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                handleRevoke();
              }}
              disabled={isPending}
            >
              {isPending ? "Revoking..." : "Revoke link"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
