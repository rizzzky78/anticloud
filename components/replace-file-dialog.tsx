"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, UploadCloud } from "lucide-react";
import { toast } from "sonner";

interface ReplaceFileDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string;
  fileName: string;
  onSuccess: () => void;
}

export function ReplaceFileDialog({
  isOpen,
  onOpenChange,
  fileId,
  fileName,
  onSuccess,
}: ReplaceFileDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file) return;

    setIsUploading(true);
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/files/${fileId}/replace`, true);
    xhr.setRequestHeader("Content-Length", file.size.toString());
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentage = Math.round((event.loaded / event.total) * 100);
        setProgress(percentage);
      }
    };

    xhr.onload = () => {
      setIsUploading(false);
      if (xhr.status === 200) {
        toast.success("File content replaced successfully");
        setFile(null);
        onOpenChange(false);
        onSuccess();
      } else {
        let errMsg = "Failed to replace file content";
        try {
          const res = JSON.parse(xhr.responseText);
          errMsg = res.message || errMsg;
        } catch {}
        toast.error(errMsg);
      }
    };

    xhr.onerror = () => {
      setIsUploading(false);
      toast.error("Network error during upload");
    };

    xhr.send(file);
  };

  const handleClose = () => {
    if (isUploading) return;
    setFile(null);
    setProgress(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Replace File Binary</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Warn about destructive replace */}
          <div className="flex gap-3 p-4 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
            <AlertCircle className="size-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Destructive Action</p>
              <p className="text-destructive/90">
                You are about to overwrite the content of <strong>{fileName}</strong>. 
                Any existing downloads of this file will reflect the new content. This cannot be undone.
              </p>
            </div>
          </div>

          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center border-2 border-dashed border-muted hover:border-primary/50 rounded-lg p-8 cursor-pointer transition-colors"
            >
              <UploadCloud className="size-8 text-muted-foreground mb-2" />
              <span className="text-sm font-medium">Click to select new file</span>
              <span className="text-xs text-muted-foreground mt-1">
                Size cap 2 GiB
              </span>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          ) : (
            <div className="rounded-lg border p-4 bg-muted/30">
              <div className="flex justify-between items-center text-sm mb-2">
                <span className="font-medium truncate max-w-[250px]" title={file.name}>
                  {file.name}
                </span>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
              {isUploading && (
                <div className="space-y-2">
                  <Progress value={progress} className="h-1.5" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Uploading...</span>
                    <span>{progress}%</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={!file || isUploading}
          >
            {isUploading ? "Uploading..." : "Replace Binary"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
