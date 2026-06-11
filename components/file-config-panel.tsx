"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import {
  setTTL,
  setReadOnly,
  setMentionRestricted,
  generatePermanentToken,
  revokePermanentToken,
} from "@/actions/file-config";
import { CalendarIcon, Link2, Copy, Check, RotateCw, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { FileMetaRecord } from "@/lib/file-meta";

interface FileConfigPanelProps {
  file: Pick<
    FileMetaRecord,
    "id" | "displayName" | "isReadOnly" | "isMentionRestricted" | "permanentUrlToken" | "expiresAt"
  >;
  userRole: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function FileConfigPanel({
  file,
  userRole,
  isOpen,
  onOpenChange,
  onSuccess,
}: FileConfigPanelProps) {
  const [isReadOnlyState, setIsReadOnlyState] = useState(file.isReadOnly);
  const [isMentionRestrictedState, setIsMentionRestrictedState] = useState(file.isMentionRestricted);
  const [permanentToken, setPermanentToken] = useState<string | null>(file.permanentUrlToken);
  const [permanentUrl, setPermanentUrl] = useState<string | null>(null);
  const [expiryDate, setExpiryDate] = useState<Date | undefined>(
    file.expiresAt ? new Date(file.expiresAt) : undefined
  );
  
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isSuperadmin = userRole === "SUPERADMIN";

  // Re-sync state with file prop when sheet opens
  useEffect(() => {
    if (isOpen) {
      setIsReadOnlyState(file.isReadOnly);
      setIsMentionRestrictedState(file.isMentionRestricted);
      setPermanentToken(file.permanentUrlToken);
      setExpiryDate(file.expiresAt ? new Date(file.expiresAt) : undefined);
      setCopied(false);
      
      if (file.permanentUrlToken) {
        // Approximate URL derivation (it will also resolve properly from generator)
        setPermanentUrl(`${window.location.origin}/api/files/p/${file.permanentUrlToken}`);
      } else {
        setPermanentUrl(null);
      }
    }
  }, [isOpen, file]);

  const handleTTLChange = (date: Date | undefined) => {
    setExpiryDate(date);
    startTransition(async () => {
      try {
        await setTTL({
          fileId: file.id,
          expiresAt: date ? date.toISOString() : null,
        });
        toast.success(date ? "Expiration date updated" : "Expiration cleared");
        onSuccess();
      } catch (err: any) {
        toast.error(err?.message || "Failed to set expiration date");
        // Revert
        setExpiryDate(file.expiresAt ? new Date(file.expiresAt) : undefined);
      }
    });
  };

  const handleReadOnlyToggle = (checked: boolean) => {
    setIsReadOnlyState(checked);
    startTransition(async () => {
      try {
        await setReadOnly({ fileId: file.id, isReadOnly: checked });
        toast.success(checked ? "File set to read-only" : "File read-only flag lifted");
        onSuccess();
      } catch (err: any) {
        toast.error(err?.message || "Failed to toggle read-only");
        setIsReadOnlyState(file.isReadOnly); // Revert
      }
    });
  };

  const handleMentionRestrictedToggle = (checked: boolean) => {
    setIsMentionRestrictedState(checked);
    startTransition(async () => {
      try {
        await setMentionRestricted({ fileId: file.id, isMentionRestricted: checked });
        toast.success(checked ? "File access gated by mentions" : "File access gating removed");
        onSuccess();
      } catch (err: any) {
        toast.error(err?.message || "Failed to toggle mention restriction");
        setIsMentionRestrictedState(file.isMentionRestricted); // Revert
      }
    });
  };

  const handleGenerateLink = () => {
    startTransition(async () => {
      try {
        const res = await generatePermanentToken({ fileId: file.id });
        setPermanentToken(res.token);
        setPermanentUrl(res.url);
        toast.success("Permanent link generated");
        onSuccess();
      } catch (err: any) {
        toast.error(err?.message || "Failed to generate link");
      }
    });
  };

  const handleRevokeLink = () => {
    startTransition(async () => {
      try {
        await revokePermanentToken({ fileId: file.id });
        setPermanentToken(null);
        setPermanentUrl(null);
        toast.success("Permanent link revoked");
        onSuccess();
      } catch (err: any) {
        toast.error(err?.message || "Failed to revoke link");
      }
    });
  };

  const copyToClipboard = () => {
    if (!permanentUrl) return;
    navigator.clipboard.writeText(permanentUrl);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // Calculate countdown helper
  const getCountdownText = () => {
    if (!expiryDate) return null;
    const diff = expiryDate.getTime() - Date.now();
    if (diff <= 0) return "Expired";
    
    const days = Math.floor(diff / (24 * 3600 * 1000));
    if (days > 0) return `expires in ${days}d`;
    
    const hours = Math.floor(diff / (3600 * 1000));
    if (hours > 0) return `expires in ${hours}h`;

    const mins = Math.floor(diff / (60 * 1000));
    return `expires in ${mins}m`;
  };

  const countdownText = getCountdownText();

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Lifecycle Configuration</SheetTitle>
          <SheetDescription>
            Configure file access restrictions, read-only modes, and automatic expiration.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Expiry Date (TTL) */}
          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-1.5">
              <CalendarIcon className="size-4 text-muted-foreground" /> Auto Expiration (TTL)
            </label>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex-1 justify-start text-left font-normal"
                    disabled={isPending}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {expiryDate ? format(expiryDate, "PPP") : <span>No expiration</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={expiryDate}
                    onSelect={handleTTLChange}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {expiryDate && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleTTLChange(undefined)}
                  disabled={isPending}
                  title="Clear Expiration"
                >
                  <XCircle className="size-4 text-muted-foreground hover:text-foreground" />
                </Button>
              )}
            </div>
            {expiryDate && countdownText && (
              <div className="mt-1">
                <Badge variant={countdownText === "Expired" ? "destructive" : "secondary"}>
                  {countdownText}
                </Badge>
              </div>
            )}
            <p className="text-xs text-muted-foreground leading-normal">
              Once expired, the file becomes inaccessible and is soft-deleted.
            </p>
          </div>

          {/* Read Only Toggle */}
          <div className="flex items-start justify-between rounded-lg border p-4">
            <div className="space-y-0.5 mr-4">
              <label className="text-sm font-semibold" htmlFor="readonly-switch">
                Read-Only Mode
              </label>
              <p className="text-xs text-muted-foreground leading-normal mt-1">
                Prevents file renaming, moving, and binary replacements by non-superadmins.
              </p>
            </div>
            <Switch
              id="readonly-switch"
              checked={isReadOnlyState}
              onCheckedChange={handleReadOnlyToggle}
              disabled={isPending}
            />
          </div>

          {/* Mention Restricted Toggle */}
          <div className="flex items-start justify-between rounded-lg border p-4">
            <div className="space-y-0.5 mr-4">
              <label className="text-sm font-semibold" htmlFor="mention-restricted-switch">
                Mention-Restricted Gating
              </label>
              <p className="text-xs text-muted-foreground leading-normal mt-1">
                If checked, users without explicit permission grants must be explicitly @mentioned in the file to view it.
              </p>
            </div>
            <Switch
              id="mention-restricted-switch"
              checked={isMentionRestrictedState}
              onCheckedChange={handleMentionRestrictedToggle}
              disabled={isPending}
            />
          </div>

          {/* Permanent Link generation */}
          <div className="rounded-lg border p-4 space-y-3">
            <label className="text-sm font-semibold flex items-center gap-1.5">
              <Link2 className="size-4 text-muted-foreground" /> Permanent Public URL
            </label>
            <p className="text-xs text-muted-foreground leading-normal">
              Generate a unique permanent URL for viewing/downloading the file. Only active while the file visibility is PUBLIC.
            </p>

            {permanentUrl ? (
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2 rounded bg-muted p-2 text-xs font-mono select-all break-all border">
                  <span className="flex-1 truncate">{permanentUrl}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={copyToClipboard}
                    title="Copy URL"
                  >
                    {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={handleGenerateLink}
                    disabled={isPending}
                  >
                    <RotateCw className="size-3 mr-1.5" /> Rotate Link
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={handleRevokeLink}
                    disabled={isPending}
                  >
                    Revoke Access
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={handleGenerateLink}
                disabled={isPending}
              >
                Create Permanent Link
              </Button>
            )}
          </div>

          {file.isReadOnly && !isSuperadmin && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">File is Read-only:</span> You can configure lifecycle settings, but file content mutations are locked.
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
