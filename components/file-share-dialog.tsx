"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileSharingPanel } from "@/components/file-sharing-panel";
import { Share2 } from "lucide-react";
import { FileMetaRecord } from "@/lib/file-meta";

interface FileShareDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string;
  file: Pick<
    FileMetaRecord,
    "id" | "displayName" | "visibility" | "guestAccess" | "isMentionRestricted" | "ownerId" | "isReadOnly"
  >;
  currentUserRole: string;
  currentUserId: string;
  onOpenVisibility?: () => void;
  onOpenConfig?: () => void;
  onSuccess?: () => void;
}

export function FileShareDialog({
  isOpen,
  onOpenChange,
  fileId,
  file,
  currentUserRole,
  currentUserId,
  onOpenVisibility,
  onOpenConfig,
  onSuccess,
}: FileShareDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="border-b pb-3 mb-4">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Share2 className="size-4 text-primary" /> Share File: {file.displayName}
          </DialogTitle>
        </DialogHeader>

        <FileSharingPanel
          fileId={fileId}
          file={file}
          currentUserRole={currentUserRole}
          currentUserId={currentUserId}
          onOpenVisibility={onOpenVisibility}
          onOpenConfig={onOpenConfig}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
