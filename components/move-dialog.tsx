"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { moveFile } from "@/actions/files";
import { toast } from "sonner";

interface MoveDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string;
  currentFolder: string;
  folderPaths: string[];
  onSuccess: () => void;
}

export function MoveDialog({
  isOpen,
  onOpenChange,
  fileId,
  currentFolder,
  folderPaths,
  onSuccess,
}: MoveDialogProps) {
  const [selectedFolder, setSelectedFolder] = useState(currentFolder);
  const [isCustom, setIsCustom] = useState(false);
  const [customPath, setCustomPath] = useState("");
  const [isPending, startTransition] = useTransition();

  // Deduplicate and ensure root '/' is always included
  const folders = Array.from(new Set(["/", ...folderPaths]));

  useEffect(() => {
    if (isOpen) {
      setSelectedFolder(currentFolder);
      setIsCustom(false);
      setCustomPath("");
    }
  }, [isOpen, currentFolder]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let targetPath = isCustom ? customPath.trim() : selectedFolder;

    // Ensure it starts with '/'
    if (!targetPath.startsWith("/")) {
      targetPath = "/" + targetPath;
    }

    // Clean multiple slashes and trailing slashes if not root
    targetPath = targetPath.replace(/\/+/g, "/");
    if (targetPath.length > 1 && targetPath.endsWith("/")) {
      targetPath = targetPath.slice(0, -1);
    }

    if (!targetPath || targetPath === "/") {
      if (isCustom && !customPath.trim()) {
        toast.error("Folder path cannot be empty");
        return;
      }
    }

    startTransition(async () => {
      try {
        await moveFile({ fileId, folderPath: targetPath });
        toast.success(`File moved to ${targetPath}`);
        onOpenChange(false);
        onSuccess();
      } catch (err: any) {
        toast.error(err?.message || "Failed to move file");
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move File</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isCustom ? (
            <Field>
              <FieldLabel htmlFor="folder-select">Select Folder</FieldLabel>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select
                    value={selectedFolder}
                    onValueChange={setSelectedFolder}
                    disabled={isPending}
                  >
                    <SelectTrigger id="folder-select">
                      <SelectValue placeholder="Select a folder" />
                    </SelectTrigger>
                    <SelectContent>
                      {folders.map((path) => (
                        <SelectItem key={path} value={path}>
                          {path === "/" ? "Root (/)" : path}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCustom(true)}
                  disabled={isPending}
                >
                  New Folder
                </Button>
              </div>
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="custom-folder-input">Custom Folder Path</FieldLabel>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    id="custom-folder-input"
                    value={customPath}
                    onChange={(e) => setCustomPath(e.target.value)}
                    placeholder="e.g. /documents/finance"
                    disabled={isPending}
                    autoFocus
                  />
                  <FieldDescription>
                    Must start with / (e.g. /documents)
                  </FieldDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCustom(false)}
                  disabled={isPending}
                >
                  Choose Existing
                </Button>
              </div>
            </Field>
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
            <Button
              type="submit"
              disabled={
                isPending ||
                (!isCustom && !selectedFolder) ||
                (isCustom && !customPath.trim())
              }
            >
              {isPending ? "Moving..." : "Move"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
