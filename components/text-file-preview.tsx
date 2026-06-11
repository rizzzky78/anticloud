"use client";

import { useState, useEffect } from "react";
import { Loader2, AlertCircle } from "lucide-react";

export function TextFilePreview({ fileId }: { fileId: string }) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/files/${fileId}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.text();
      })
      .then((text) => {
        // Truncate to first 100KB to prevent page lag
        if (text.length > 100 * 1024) {
          setContent(text.slice(0, 100 * 1024) + "\n\n...[file truncated for preview]...");
        } else {
          setContent(text);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [fileId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60 border rounded-lg bg-muted/20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-40 border rounded-lg border-destructive/20 bg-destructive/5 text-destructive text-sm gap-2">
        <AlertCircle className="size-4" /> Failed to load text preview.
      </div>
    );
  }

  return (
    <pre className="p-4 border rounded-lg bg-muted/30 font-mono text-xs overflow-auto max-h-[500px] whitespace-pre-wrap leading-relaxed select-text">
      {content || <span className="text-muted-foreground italic">File is empty</span>}
    </pre>
  );
}
