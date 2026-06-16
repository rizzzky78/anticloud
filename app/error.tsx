"use client"; // Error boundaries must be Client Components

import { ErrorFallback } from "@/components/error-fallback";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <ErrorFallback error={error} onRetry={unstable_retry} />;
}
