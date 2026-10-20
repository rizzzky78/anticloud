import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CloudIcon, Clock, Download, LinkIcon, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getFileIcon } from "@/components/file-list-types";
import { formatBytes, formatDate } from "@/lib/format";
import { isUnlocked, resolveShareLink, unlockCookieName } from "@/lib/share-links";
import { ShareUnlockForm } from "./share-unlock-form";

export const metadata: Metadata = {
  title: "Shared file · Anticloud",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

const UNAVAILABLE: Record<string, { title: string; body: string }> = {
  not_found: {
    title: "Link not found",
    body: "This share link does not exist or the file is no longer available.",
  },
  revoked: { title: "Link revoked", body: "The owner has turned off this share link." },
  expired: { title: "Link expired", body: "This share link has passed its expiry date." },
  exhausted: {
    title: "Download limit reached",
    body: "This share link has been used the maximum number of times.",
  },
};

function isPreviewableImage(mimeType: string) {
  return ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"].includes(mimeType);
}

type ResolvedLink = Extract<Awaited<ReturnType<typeof resolveShareLink>>, { ok: true }>["link"];

async function SharedFileCard({ token, link }: { token: string; link: ResolvedLink }) {
  const cookieStore = await cookies();
  const unlocked = isUnlocked(link, cookieStore.get(unlockCookieName(link.id))?.value);
  const Icon = getFileIcon(link.file.mimeType);
  const remaining =
    link.maxDownloads !== null ? link.maxDownloads - link.downloadCount : null;

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border bg-muted/60 p-3">
            <Icon className="size-6 text-muted-foreground" />
          </div>
          <div className="min-w-0 space-y-1">
            <CardTitle className="break-words text-base leading-snug">
              {link.file.displayName}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {formatBytes(link.file.size.toString())} · {link.file.mimeType}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {link.createdBy && (
            <Badge variant="outline" className="gap-1 font-normal">
              <User className="size-3" /> Shared by {link.createdBy.name}
            </Badge>
          )}
          {link.expiresAt && (
            <Badge variant="outline" className="gap-1 font-normal">
              <Clock className="size-3" /> Expires {formatDate(link.expiresAt.toISOString())}
            </Badge>
          )}
          {remaining !== null && (
            <Badge variant="outline" className="font-normal">
              {remaining} download{remaining === 1 ? "" : "s"} left
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!unlocked ? (
          <ShareUnlockForm token={token} />
        ) : (
          <>
            {isPreviewableImage(link.file.mimeType) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/s/${token}?preview=1`}
                alt={link.file.displayName}
                className="max-h-[60vh] w-full rounded-lg border object-contain bg-muted/40"
              />
            )}
            <Button asChild className="w-full">
              <a href={`/api/s/${token}`}>
                <Download className="mr-2 size-4" /> Download
              </a>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Public landing page for a share link — no account required. */
export default async function SharedFilePage({ params }: PageProps) {
  const { token } = await params;
  const state = await resolveShareLink(token);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
      <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <CloudIcon className="size-4" /> Anticloud
      </div>

      {!state.ok ? (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LinkIcon className="size-4 text-muted-foreground" />
              {UNAVAILABLE[state.reason].title}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {UNAVAILABLE[state.reason].body}
          </CardContent>
        </Card>
      ) : (
        <SharedFileCard token={token} link={state.link} />
      )}
    </div>
  );
}
