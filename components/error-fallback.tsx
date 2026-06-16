"use client";

import { useEffect } from "react";
import Link from "next/link";
import { House, RefreshCw, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

type ErrorFallbackProps = {
  /** The error forwarded from a Next.js error boundary. */
  error: Error & { digest?: string };
  /** Re-render the boundary's children (e.g. Next.js `unstable_retry`/`reset`). */
  onRetry?: () => void;
  /** Whether to show a link back to the app home. Defaults to `true`. */
  showHome?: boolean;
  title?: string;
  description?: string;
  className?: string;
};

/**
 * Full-page fallback UI for route-level error boundaries (`error.tsx` /
 * `global-error.tsx`). Presentational only — it never surfaces stack traces to
 * the user in production, keeping error states free of sensitive details. For
 * inline, non-fatal errors use {@link ErrorState} instead.
 */
export function ErrorFallback({
  error,
  onRetry,
  showHome = true,
  title = "Something went wrong",
  description = "An unexpected error occurred while loading this page. You can try again, and if the problem persists, head back home.",
  className,
}: ErrorFallbackProps) {
  useEffect(() => {
    // Forward to the console so it reaches any error-reporting integration.
    console.error(error);
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <Empty className={cn("min-h-[60vh] border-0", className)}>
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="size-12 bg-destructive/10 text-destructive [&_svg:not([class*='size-'])]:size-6"
        >
          <TriangleAlert />
        </EmptyMedia>
        <EmptyTitle className="text-xl">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>

      <EmptyContent>
        <div className="flex flex-col-reverse items-center gap-2 sm:flex-row sm:justify-center">
          {showHome ? (
            <Button variant="outline" asChild>
              <Link href="/">
                <House data-icon="inline-start" />
                Go home
              </Link>
            </Button>
          ) : null}
          {onRetry ? (
            <Button onClick={onRetry}>
              <RefreshCw data-icon="inline-start" />
              Try again
            </Button>
          ) : null}
        </div>

        {error.digest ? (
          <p className="text-xs text-muted-foreground">
            Reference code:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
              {error.digest}
            </code>
          </p>
        ) : null}

        {isDev && error.message ? (
          <pre className="mt-2 max-h-48 w-full overflow-auto rounded-lg bg-muted p-3 text-left font-mono text-xs leading-relaxed text-destructive">
            {error.message}
          </pre>
        ) : null}
      </EmptyContent>
    </Empty>
  );
}
