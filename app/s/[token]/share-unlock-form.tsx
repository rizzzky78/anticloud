"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { unlockShareLink } from "@/actions/share-links";

/** Password prompt for a protected share link. */
export function ShareUnlockForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await unlockShareLink({ token, password });
        if (res.ok) {
          router.refresh();
        } else {
          setError(res.message ?? "Unable to unlock this link.");
        }
      } catch {
        setError("Unable to unlock this link.");
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="share-password" className="flex items-center gap-1.5">
          <Lock className="size-3.5" /> This file is password protected
        </Label>
        <Input
          id="share-password"
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          disabled={isPending}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={isPending || password.length === 0}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : "Unlock"}
      </Button>
    </form>
  );
}
