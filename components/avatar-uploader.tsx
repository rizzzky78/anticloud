"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

interface AvatarUploaderProps {
  image: string | null | undefined;
  name: string;
  initials: string;
}

/** Profile picture with upload / remove controls. */
export function AvatarUploader({ image, name, initials }: AvatarUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(image ?? null);
  const [busy, setBusy] = useState(false);

  const refreshSession = async () => {
    // Re-read the session so the sidebar and header pick up the new image.
    await authClient.getSession({ query: { disableCookieCache: true } });
    router.refresh();
  };

  const upload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5 MB or smaller");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/avatar", {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "Upload failed");
      setPreview(body.image);
      toast.success("Profile picture updated");
      await refreshSession();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/account/avatar", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove picture");
      setPreview(null);
      toast.success("Profile picture removed");
      await refreshSession();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove picture");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative shrink-0 group">
      <Avatar className="size-12 text-base">
        <AvatarImage src={preview ?? ""} alt={name} />
        <AvatarFallback className="bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
      </Avatar>
      <div className="absolute -bottom-1 -right-1 flex gap-0.5">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="size-6 rounded-full border shadow-xs"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          title="Change profile picture"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Camera className="size-3" />}
        </Button>
        {preview && (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="size-6 rounded-full border shadow-xs opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            onClick={remove}
            disabled={busy}
            title="Remove profile picture"
          >
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
    </div>
  );
}
