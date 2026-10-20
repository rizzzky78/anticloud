import Link from "next/link";
import { redirect } from "next/navigation";
import { HardDriveIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { getQuotaStatus, usageByCategory, usageByOwner, type CategoryUsage } from "@/lib/quota";
import { formatBytes } from "@/lib/format";
import { getFileIcon } from "@/components/file-list-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const dynamic = "force-dynamic";

function pct(part: bigint, whole: bigint): number {
  if (whole <= BigInt(0)) return 0;
  return Math.min(100, Number((part * BigInt(10000)) / whole) / 100);
}

function CategoryList({ rows }: { rows: CategoryUsage[] }) {
  const total = rows.reduce((acc, r) => acc + r.bytes, BigInt(0));
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No files yet.</p>;
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.category} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{r.category}</span>
            <span className="text-muted-foreground">
              {formatBytes(r.bytes.toString())} · {r.files} file{r.files === 1 ? "" : "s"}
            </span>
          </div>
          <Progress value={pct(r.bytes, total)} className="h-1.5" />
        </li>
      ))}
    </ul>
  );
}

export default async function StoragePage() {
  const session = await getCurrentUser();
  if (!session) redirect("/sign-in");

  const userId = session.user.id;
  const role = session.user.role as string;
  const isAdmin = role === "ADMIN" || role === "SUPERADMIN";

  const [status, categories, largest] = await Promise.all([
    getQuotaStatus(userId),
    usageByCategory(userId),
    db.file.findMany({
      where: { ownerId: userId, deletedAt: null },
      orderBy: { size: "desc" },
      take: 10,
      select: { id: true, displayName: true, mimeType: true, size: true, folderPath: true },
    }),
  ]);

  const admin = isAdmin
    ? await (async () => {
        const [systemCategories, byOwner, totals] = await Promise.all([
          usageByCategory(null),
          usageByOwner(),
          db.$queryRaw<{ files: bigint; users: bigint; bytes: bigint | null }[]>`
            SELECT
              (SELECT COUNT(*) FROM "file" WHERE "deletedAt" IS NULL) AS files,
              (SELECT COUNT(*) FROM "user") AS users,
              (SELECT COALESCE(SUM(size), 0) FROM "file") + (SELECT COALESCE(SUM(size), 0) FROM file_version) AS bytes
          `,
        ]);
        const topIds = [...byOwner.entries()]
          .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
          .slice(0, 10);
        const names = await db.user.findMany({
          where: { id: { in: topIds.map(([id]) => id) } },
          select: { id: true, name: true },
        });
        const nameById = new Map(names.map((n) => [n.id, n.name]));
        return {
          systemCategories,
          top: topIds.map(([id, bytes]) => ({ id, name: nameById.get(id) ?? "Unknown", bytes })),
          files: Number(totals[0]?.files ?? 0),
          users: Number(totals[0]?.users ?? 0),
          bytes: BigInt(totals[0]?.bytes ?? 0),
        };
      })()
    : null;

  const used = status.total;
  const quota = status.quota;

  return (
    <div className="flex-1 space-y-6 w-full mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <HardDriveIcon className="size-6 text-primary" /> Storage
        </h1>
        <p className="text-muted-foreground text-sm">
          How much space your files use, and what is taking it up.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Your usage</CardTitle>
            <CardDescription>
              {formatBytes(used.toString())} used
              {quota !== null ? ` of ${formatBytes(quota.toString())}` : " · no limit"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {quota !== null && (
              <Progress value={pct(used, quota)} className={pct(used, quota) > 90 ? "h-2.5 [&>div]:bg-destructive" : "h-2.5"} />
            )}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Files</p>
                <p className="font-semibold">{formatBytes(status.live.toString())}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Recycle bin</p>
                <p className="font-semibold">{formatBytes(status.trash.toString())}</p>
                {status.trash > BigInt(0) && (
                  <Link href="/trash" className="text-xs text-primary hover:underline">
                    Free up space
                  </Link>
                )}
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Version history</p>
                <p className="font-semibold">{formatBytes(status.versions.toString())}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">By type</CardTitle>
            <CardDescription>Your live files</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryList rows={categories} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Largest files</CardTitle>
          <CardDescription>Your ten biggest files</CardDescription>
        </CardHeader>
        <CardContent>
          {largest.length === 0 ? (
            <p className="text-sm text-muted-foreground">No files yet.</p>
          ) : (
            <ul className="divide-y">
              {largest.map((f) => {
                const Icon = getFileIcon(f.mimeType);
                return (
                  <li key={f.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link href={`/files/${f.id}`} className="flex items-center gap-3 min-w-0 hover:underline">
                      <Icon className="size-4 text-muted-foreground shrink-0" />
                      <span className="truncate text-sm font-medium">{f.displayName}</span>
                      <span className="hidden sm:inline truncate text-xs text-muted-foreground font-mono">
                        {f.folderPath}
                      </span>
                    </Link>
                    <span className="text-sm text-muted-foreground shrink-0">
                      {formatBytes(f.size.toString())}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {admin && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">System</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total stored</CardDescription>
                <CardTitle className="text-2xl">{formatBytes(admin.bytes.toString())}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Live files</CardDescription>
                <CardTitle className="text-2xl">{admin.files.toLocaleString()}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Users</CardDescription>
                <CardTitle className="text-2xl">{admin.users.toLocaleString()}</CardTitle>
              </CardHeader>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top users by storage</CardTitle>
                <CardDescription>Files, recycle bin and versions</CardDescription>
              </CardHeader>
              <CardContent>
                {admin.top.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No usage yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {admin.top.map((u) => (
                      <li key={u.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium truncate">{u.name}</span>
                          <span className="text-muted-foreground">{formatBytes(u.bytes.toString())}</span>
                        </div>
                        <Progress value={pct(u.bytes, admin.top[0].bytes)} className="h-1.5" />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Storage by type</CardTitle>
                <CardDescription>All live files</CardDescription>
              </CardHeader>
              <CardContent>
                <CategoryList rows={admin.systemCategories} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
