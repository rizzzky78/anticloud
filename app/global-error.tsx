"use client"; // Error boundaries must be Client Components

import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorFallback } from "@/components/error-fallback";

// global-error replaces the root layout when active, so it must define its own
// <html>/<body> and pull in global styles, fonts, and providers itself.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col">
        {/* metadata exports aren't supported here — set the tab title directly. */}
        <title>Something went wrong — Anticloud</title>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <main className={cn("flex flex-1 items-center justify-center p-6")}>
            <ErrorFallback error={error} onRetry={unstable_retry} />
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
