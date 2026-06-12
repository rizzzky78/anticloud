"use client";

import { useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import {
  MediaController,
  MediaControlBar,
  MediaTimeRange,
  MediaTimeDisplay,
  MediaVolumeRange,
  MediaPlayButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaMuteButton,
  MediaFullscreenButton,
  MediaPlaybackRateButton,
} from "media-chrome/react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCw,
  ImageOff,
  Music,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Theme tokens for the media-chrome players. media-chrome is styled through its
 * own CSS custom properties; we map them onto the app's design tokens so the
 * player matches light/dark mode without hardcoding colors.
 */
const mediaTheme = {
  "--media-primary-color": "var(--primary)",
  "--media-secondary-color": "transparent",
  "--media-text-color": "var(--foreground)",
  "--media-control-hover-background": "var(--accent)",
  "--media-range-thumb-background": "var(--primary)",
  "--media-range-track-height": "4px",
  "--media-font-family": "var(--font-sans)",
} as React.CSSProperties;

interface MediaSrcProps {
  /** Stable streaming URL for the file binary (`/api/files/[id]`). */
  src: string;
  alt: string;
}

/**
 * Interactive image viewer with scroll/pinch zoom, drag-to-pan, and rotation.
 * Backed by react-zoom-pan-pinch.
 */
export function ImageViewer({ src, alt }: MediaSrcProps) {
  const [rotation, setRotation] = useState(0);
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
        <ImageOff className="size-12 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium">Could not load image</p>
        <p className="text-xs mt-1">
          The file may be unavailable or corrupted.
        </p>
      </div>
    );
  }

  return (
    <TransformWrapper
      initialScale={1}
      minScale={0.5}
      maxScale={8}
      centerOnInit
      doubleClick={{ mode: "toggle", step: 0.7 }}
      wheel={{ step: 0.15 }}
    >
      {({ zoomIn, zoomOut, resetTransform }) => (
        <div className="relative w-full overflow-hidden rounded-lg border bg-checkered">
          {/* Floating zoom/rotate controls */}
          <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5 rounded-lg border bg-background/80 p-1 shadow-xs backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => zoomIn()}
              aria-label="Zoom in"
            >
              <ZoomIn className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => zoomOut()}
              aria-label="Zoom out"
            >
              <ZoomOut className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              aria-label="Rotate"
            >
              <RotateCw className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => {
                setRotation(0);
                resetTransform();
              }}
              aria-label="Reset view"
            >
              <Maximize2 className="size-4" />
            </Button>
          </div>

          <TransformComponent
            wrapperClass="!w-full !h-[500px]"
            contentClass="!w-full !h-full flex items-center justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              onError={() => setErrored(true)}
              draggable={false}
              className="max-h-[500px] max-w-full object-contain transition-transform duration-200 select-none"
              style={{ transform: `rotate(${rotation}deg)` }}
            />
          </TransformComponent>
        </div>
      )}
    </TransformWrapper>
  );
}

/** Full-featured video player (seek, volume, playback rate, fullscreen). */
export function VideoPlayer({ src, alt }: MediaSrcProps) {
  return (
    <MediaController
      style={mediaTheme}
      className="w-full overflow-hidden rounded-lg border bg-black shadow-xs aspect-video"
    >
      <video
        slot="media"
        src={src}
        preload="metadata"
        playsInline
        aria-label={alt}
        className="h-full w-full"
      />
      <MediaControlBar className="w-full">
        <MediaPlayButton />
        <MediaSeekBackwardButton seekOffset={10} />
        <MediaSeekForwardButton seekOffset={10} />
        <MediaTimeRange />
        <MediaTimeDisplay showDuration />
        <MediaMuteButton />
        <MediaVolumeRange />
        <MediaPlaybackRateButton />
        <MediaFullscreenButton />
      </MediaControlBar>
    </MediaController>
  );
}

/** Compact audio player with artwork-less header and full transport controls. */
export function AudioPlayer({ src, alt }: MediaSrcProps) {
  return (
    <div className="w-full rounded-lg border bg-card overflow-hidden p-5 shadow-xs">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Music className="size-6" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={alt}>
            {alt}
          </p>
          <p className="text-xs text-muted-foreground">Audio file</p>
        </div>
      </div>
      <MediaController audio style={mediaTheme} className={cn("w-full")}>
        <audio slot="media" src={src} preload="metadata" aria-label={alt} />
        <MediaControlBar className="w-full rounded-md bg-muted/40">
          <MediaPlayButton />
          <MediaSeekBackwardButton seekOffset={10} />
          <MediaSeekForwardButton seekOffset={10} />
          <MediaTimeRange />
          <MediaTimeDisplay showDuration />
          <MediaMuteButton />
          <MediaVolumeRange />
          <MediaPlaybackRateButton />
        </MediaControlBar>
      </MediaController>
    </div>
  );
}
