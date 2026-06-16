"use client";

import { useEffect, useState } from "react";
import { formatDate, formatRelativeDate } from "@/lib/format";

interface RelativeDateProps {
  iso: string;
  className?: string;
}

/**
 * Renders a relative timestamp ("3 days ago") without triggering a hydration
 * mismatch. Relative formatting is computed against "now", which differs
 * between the server render and client hydration, so the first client render
 * must match the server markup exactly. We render the deterministic absolute
 * date on the server and initial client render, then swap to the relative
 * string after mount.
 */
export function RelativeDate({ iso, className }: RelativeDateProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <span className={className} title={formatDate(iso)} suppressHydrationWarning>
      {mounted ? formatRelativeDate(iso) : formatDate(iso)}
    </span>
  );
}
