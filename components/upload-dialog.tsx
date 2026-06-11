"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UploadCloud, FileIcon, X, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { formatBytes } from "@/lib/format";

interface UploadDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentFolderPath: string;
  onSuccess: () => void;
}

interface UploadQueueItem {
  id: string;
  file: File;
  progress: number;
  status: "waiting" | "uploading" | "success" | "error";
  errorMsg?: string;
}

export function UploadDialog({
  isOpen,
  onOpenChange,
  currentFolderPath,
  onSuccess,
}: UploadDialogProps) {
  const [folderPath, setFolderPath] = useState(currentFolderPath);
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PRIVATE");
  const [guestAccess, setGuestAccess] = useState(false);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeXhrRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFolderPath(currentFolderPath);
      setVisibility("PRIVATE");
      setGuestAccess(false);
      setQueue([]);
      setIsUploading(false);
    }
  }, [isOpen, currentFolderPath]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const addFilesToQueue = (fileList: FileList) => {
    const newItems: UploadQueueItem[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.size > 2 * 1024 * 1024 * 1024) {
        toast.error(`File ${file.name} exceeds the 2 GiB upload limit.`);
        continue;
      }
      newItems.push({
        id: Math.random().toString(36).substring(7),
        file,
        progress: 0,
        status: "waiting",
      });
    }
    setQueue((prev) => [...prev, ...newItems]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(e.target.files);
    }
  };

  const removeQueueItem = (id: string) => {
    if (isUploading) return;
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const startUpload = () => {
    if (queue.length === 0 || isUploading) return;
    setIsUploading(true);
    uploadSequentially(0);
  };

  const uploadSequentially = (index: number) => {
    if (index >= queue.length) {
      setIsUploading(false);
      toast.success("All uploads completed");
      onSuccess();
      return;
    }

    const item = queue[index];
    if (item.status === "success") {
      uploadSequentially(index + 1);
      return;
    }

    setQueue((prev) =>
      prev.map((q, idx) => (idx === index ? { ...q, status: "uploading" } : q))
    );

    const xhr = new XMLHttpRequest();
    activeXhrRef.current = xhr;
    xhr.open("POST", "/api/files/upload", true);
    
    xhr.setRequestHeader("Content-Length", item.file.size.toString());
    
    let displayName = item.file.name;
    try {
      xhr.setRequestHeader("X-Display-Name", displayName);
    } catch {
      displayName = displayName.replace(/[^\x00-\x7F]/g, "_");
      xhr.setRequestHeader("X-Display-Name", displayName);
    }

    xhr.setRequestHeader("Content-Type", item.file.type || "application/octet-stream");
    
    let cleanFolder = folderPath.trim();
    if (!cleanFolder.startsWith("/")) {
      cleanFolder = "/" + cleanFolder;
    }
    cleanFolder = cleanFolder.replace(/\/+/g, "/");
    xhr.setRequestHeader("X-Folder-Path", cleanFolder);
    xhr.setRequestHeader("X-Visibility", visibility);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentage = Math.round((event.loaded / event.total) * 100);
        setQueue((prev) =>
          prev.map((q, idx) => (idx === index ? { ...q, progress: percentage } : q))
        );
      }
    };

    xhr.onload = () => {
      activeXhrRef.current = null;
      if (xhr.status === 201) {
        setQueue((prev) =>
          prev.map((q, idx) => (idx === index ? { ...q, status: "success", progress: 100 } : q))
        );
        uploadSequentially(index + 1);
      } else {
        let errorMsg = "Upload failed";
        try {
          const res = JSON.parse(xhr.responseText);
          errorMsg = res.message || errorMsg;
        } catch {}

        if (xhr.status === 429) {
          errorMsg = "Slow down. Upload rate limit exceeded. Please wait a moment.";
        }

        setQueue((prev) =>
          prev.map((q, idx) => (idx === index ? { ...q, status: "error", errorMsg } : q))
        );
        setIsUploading(false);
        toast.error(`Upload failed for ${item.file.name}: ${errorMsg}`);
      }
    };

    xhr.onerror = () => {
      activeXhrRef.current = null;
      setQueue((prev) =>
        prev.map((q, idx) => (idx === index ? { ...q, status: "error", errorMsg: "Network error" } : q))
      );
      setIsUploading(false);
      toast.error(`Network error uploading ${item.file.name}`);
    };

    xhr.send(item.file);
  };

  const cancelUpload = () => {
    if (activeXhrRef.current) {
      activeXhrRef.current.abort();
      activeXhrRef.current = null;
    }
    setIsUploading(false);
    setQueue((prev) =>
      prev.map((q) => (q.status === "uploading" ? { ...q, status: "waiting", progress: 0 } : q))
    );
    toast.info("Upload paused");
  };

  const handleClose = () => {
    if (isUploading) {
      if (confirm("Uploading is in progress. Are you sure you want to close and cancel?")) {
        cancelUpload();
      } else {
        return;
      }
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg md:max-w-xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="upload-folder">Destination Folder</FieldLabel>
              <Input
                id="upload-folder"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="e.g. /documents"
                disabled={isUploading}
              />
              <FieldDescription>Virtual folder path</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="upload-visibility">Visibility</FieldLabel>
              <Select
                value={visibility}
                onValueChange={(val: "PUBLIC" | "PRIVATE") => setVisibility(val)}
                disabled={isUploading}
              >
                <SelectTrigger id="upload-visibility">
                  <SelectValue placeholder="Select visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIVATE">Private</SelectItem>
                  <SelectItem value="PUBLIC">Public</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {visibility === "PUBLIC" && (
            <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/20">
              <div className="space-y-0.5">
                <label className="text-sm font-medium leading-none" htmlFor="upload-guest-switch">
                  Guest Access
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  Allow guests to view/download these files without logging in
                </p>
              </div>
              <Switch
                id="upload-guest-switch"
                checked={guestAccess}
                onCheckedChange={setGuestAccess}
                disabled={isUploading}
              />
            </div>
          )}

          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-10 cursor-pointer text-center transition-colors ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted hover:border-primary/50"
            } ${isUploading ? "pointer-events-none opacity-50" : ""}`}
          >
            <UploadCloud className="size-10 text-muted-foreground mb-3" />
            <p className="text-sm font-semibold">
              Drag & drop files here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports any file type. Up to 2 GiB per file.
            </p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              className="hidden"
            />
          </div>

          {queue.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Upload Queue ({queue.length} files)
              </h3>
              <ScrollArea className="h-[200px] rounded-lg border p-4 bg-muted/10">
                <div className="space-y-3">
                  {queue.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-2.5 rounded border bg-card text-sm"
                    >
                      <FileIcon className="size-5 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="font-medium truncate max-w-[250px]" title={item.file.name}>
                            {item.file.name}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0 ml-2">
                            {formatBytes(item.file.size.toString())}
                          </span>
                        </div>

                        {item.status === "uploading" && (
                          <div className="space-y-1">
                            <Progress value={item.progress} className="h-1" />
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>Uploading...</span>
                              <span>{item.progress}%</span>
                            </div>
                          </div>
                        )}

                        {item.status === "success" && (
                          <div className="flex items-center text-xs text-emerald-600 dark:text-emerald-400 gap-1">
                            <CheckCircle2 className="size-3.5" /> Complete
                          </div>
                        )}

                        {item.status === "error" && (
                          <div className="flex items-start text-xs text-destructive gap-1 leading-normal">
                            <AlertCircle className="size-3.5 shrink-0 mt-0.5" /> 
                            <span>{item.errorMsg || "Upload failed"}</span>
                          </div>
                        )}

                        {item.status === "waiting" && (
                          <span className="text-xs text-muted-foreground">Waiting...</span>
                        )}
                      </div>

                      {!isUploading && item.status !== "success" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeQueueItem(item.id)}
                          className="size-7 -mr-1.5 -mt-1"
                        >
                          <X className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:justify-end border-t pt-4 mt-4 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isUploading && !activeXhrRef.current}
          >
            Close
          </Button>

          {isUploading ? (
            <Button type="button" variant="destructive" onClick={cancelUpload}>
              Pause Upload
            </Button>
          ) : (
            <Button
              type="button"
              onClick={startUpload}
              disabled={queue.length === 0 || queue.every((item) => item.status === "success")}
            >
              Start Uploading
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
