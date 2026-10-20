"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setStarred } from "@/actions/stars";

interface StarButtonProps {
  fileId: string;
  initialStarred: boolean;
  /** Called after a successful toggle (e.g. to refresh a Starred list). */
  onChange?: (starred: boolean) => void;
  className?: string;
}

/** Toggle a file's starred state with optimistic UI. */
export function StarButton({ fileId, initialStarred, onChange, className }: StarButtonProps) {
  const [starred, setStarredState] = useState(initialStarred);
  const [isPending, startTransition] = useTransition();

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !starred;
    setStarredState(next);
    startTransition(async () => {
      try {
        await setStarred({ fileId, starred: next });
        onChange?.(next);
      } catch (err) {
        setStarredState(!next);
        toast.error(err instanceof Error ? err.message : "Failed to update star");
      }
    });
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      disabled={isPending}
      className={cn("size-8", className)}
      title={starred ? "Remove from Starred" : "Add to Starred"}
      aria-pressed={starred}
    >
      <Star className={cn("size-4", starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
      <span className="sr-only">{starred ? "Unstar" : "Star"}</span>
    </Button>
  );
}
