"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setVisibility } from "@/actions/files";
import { toast } from "sonner";

interface VisibilityDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string;
  currentVisibility: "PUBLIC" | "PRIVATE";
  currentGuestAccess: boolean;
  onSuccess: () => void;
}

export function VisibilityDialog({
  isOpen,
  onOpenChange,
  fileId,
  currentVisibility,
  currentGuestAccess,
  onSuccess,
}: VisibilityDialogProps) {
  const [visibility, setVisibilityState] = useState<"PUBLIC" | "PRIVATE">(currentVisibility);
  const [guestAccess, setGuestAccess] = useState(currentGuestAccess);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (isOpen) {
      setVisibilityState(currentVisibility);
      setGuestAccess(currentGuestAccess);
    }
  }, [isOpen, currentVisibility, currentGuestAccess]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    startTransition(async () => {
      try {
        await setVisibility({
          fileId,
          visibility,
          guestAccess: visibility === "PUBLIC" ? guestAccess : false,
        });
        toast.success("File visibility updated");
        onOpenChange(false);
        onSuccess();
      } catch (err: any) {
        toast.error(err?.message || "Failed to update visibility");
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>File Access & Visibility</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="visibility-select">Visibility</FieldLabel>
            <Select
              value={visibility}
              onValueChange={(val: "PUBLIC" | "PRIVATE") => setVisibilityState(val)}
              disabled={isPending}
            >
              <SelectTrigger id="visibility-select">
                <SelectValue placeholder="Select visibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRIVATE">Private (Only owner & explicit grants)</SelectItem>
                <SelectItem value="PUBLIC">Public (Any authenticated user)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {visibility === "PUBLIC" && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <label className="text-sm font-medium leading-none" htmlFor="guest-access-switch">
                  Guest Access
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  Allow unauthenticated visitors to view and download this file
                </p>
              </div>
              <Switch
                id="guest-access-switch"
                checked={guestAccess}
                onCheckedChange={setGuestAccess}
                disabled={isPending}
              />
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Settings"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
