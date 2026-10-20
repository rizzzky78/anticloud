"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Fingerprint, Files } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFileIntegrity } from "@/actions/duplicates";
import type { DuplicateFile } from "@/lib/duplicates";

/** SHA-256 checksum and identical-content files the viewer can open. */
export function FileIntegrity({ fileId, version }: { fileId: string; version: number }) {
  const [sha256, setSha256] = useState<string | null | undefined>(undefined);
  const [duplicates, setDuplicates] = useState<DuplicateFile[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getFileIntegrity({ fileId })
      .then((res) => {
        if (cancelled) return;
        setSha256(res.sha256);
        setDuplicates(res.duplicates);
      })
      .catch(() => !cancelled && setSha256(null));
    return () => {
      cancelled = true;
    };
  }, [fileId, version]);

  if (sha256 === undefined) return null;

  const copy = async () => {
    if (!sha256) return;
    try {
      await navigator.clipboard.writeText(sha256);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context); the value stays selectable.
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Fingerprint className="size-3.5" /> SHA-256
        </p>
        {sha256 ? (
          <div className="flex items-start gap-2">
            <code className="flex-1 break-all rounded bg-muted/50 px-2 py-1 text-[11px] font-mono select-all">
              {sha256}
            </code>
            <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={copy} title="Copy checksum">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Not computed yet for this file.</p>
        )}
      </div>

      {duplicates.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Files className="size-3.5" /> Identical files ({duplicates.length})
          </p>
          <ul className="space-y-1">
            {duplicates.map((d) => (
              <li key={d.id} className="text-sm">
                <Link href={`/files/${d.id}`} className="hover:underline font-medium">
                  {d.displayName}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {" "}
                  · {d.folderPath}
                  {d.ownerName ? ` · ${d.ownerName}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
