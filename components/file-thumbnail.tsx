"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { getFileIcon } from "@/components/file-list-types";
import { cn } from "@/lib/utils";

interface FileThumbnailProps {
  fileId: string;
  mimeType: string;
  displayName: string;
  /** "grid" → large cover thumbnail; "list" → small square chip. */
  variant: "grid" | "list";
}

/**
 * Inline preview for image/video rows, backed by the Range-aware streaming
 * handler at `/api/files/[id]`.
 *
 * Performance notes — everything flows through the existing handler:
 *  - `?preview=1` tells the handler to skip audit logging (thumbnails would
 *    otherwise flood the trail with one `file.download` per visible row) and
 *    to send a cacheable `Cache-Control`, so scrolling/back-nav reuses bytes.
 *  - `loading="lazy"` defers off-screen images until they enter the viewport.
 *  - Videos use `preload="metadata"` + the `#t=0.1` media fragment so the
 *    browser fetches only enough (via Range) to decode the first frame for a
 *    poster, never the whole file.
 *
 * Falls back to the mime-type icon for non-media files or on load failure.
 */
export function FileThumbnail({
  fileId,
  mimeType,
  displayName,
  variant,
}: FileThumbnailProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const isImage = mimeType.startsWith("image/");
  const isVideo = mimeType.startsWith("video/");
  const showMedia = (isImage || isVideo) && !errored;
  const Icon = getFileIcon(mimeType);

  const src = `/api/files/${fileId}?preview=1`;

  const media = isImage ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={displayName}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setErrored(true)}
      className={cn(
        "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
        loaded ? "opacity-100" : "opacity-0",
      )}
    />
  ) : (
    <video
      src={`${src}#t=0.1`}
      preload="metadata"
      muted
      playsInline
      onLoadedData={() => setLoaded(true)}
      onError={() => setErrored(true)}
      className={cn(
        "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
        loaded ? "opacity-100" : "opacity-0",
      )}
    />
  );

  if (variant === "grid") {
    return (
      <div className="flex-1 min-h-[110px] bg-muted/20 flex items-center justify-center border-b border-zinc-100 dark:border-zinc-800/40 relative overflow-hidden">
        {showMedia ? (
          <>
            {media}
            {/* Icon stands in until the media paints */}
            {!loaded && (
              <Icon className="size-12 text-zinc-400 dark:text-zinc-500 shrink-0" />
            )}
            {isVideo && loaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                <div className="flex size-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                  <Play className="size-5 fill-current" />
                </div>
              </div>
            )}
          </>
        ) : (
          <Icon className="size-12 text-zinc-400 dark:text-zinc-500 shrink-0" />
        )}
      </div>
    );
  }

  // list variant — small square chip in place of the mime icon
  if (showMedia) {
    return (
      <div className="relative size-9 shrink-0 overflow-hidden rounded bg-muted/80">
        {media}
        {isVideo && loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/15">
            <Play className="size-3.5 fill-white text-white" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-2 rounded bg-muted/80 text-muted-foreground group-hover:bg-background group-hover:text-primary transition-colors">
      <Icon className="size-4 shrink-0" />
    </div>
  );
}
