import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { JobsClient } from "./jobs-client";
import { BriefcaseIcon } from "lucide-react";
import { redis, redisKey, NS } from "@/lib/redis";

export const dynamic = "force-dynamic";

export default async function AdminJobsPage() {
  const session = await getCurrentUser();
  const currentUser = session?.user;

  // Jobs dashboard is restricted to SUPERADMIN
  if (!currentUser || currentUser.role !== "SUPERADMIN") {
    notFound();
  }

  // Fetch telemetry metrics
  const queueDepth = await redis.llen(redisKey(NS.job, "queue")).catch(() => 0);
  const cacheHits = parseInt(
    (await redis.get("metrics:cache_hits_total")) || "0",
    10,
  );
  const cacheMisses = parseInt(
    (await redis.get("metrics:cache_misses_total")) || "0",
    10,
  );
  const totalCacheLookups = cacheHits + cacheMisses;
  const cacheHitRate =
    totalCacheLookups > 0 ? (cacheHits / totalCacheLookups) * 100 : 0;

  // Fetch recent background jobs
  const jobs = await db.job.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });

  // Serialize dates
  const serializedJobs = jobs.map((j) => ({
    id: j.id,
    type: j.type,
    status: j.status,
    payload: j.payload,
    attempts: j.attempts,
    maxAttempts: j.maxAttempts,
    result: j.result,
    error: j.error,
    startedAt: j.startedAt ? j.startedAt.toISOString() : null,
    completedAt: j.completedAt ? j.completedAt.toISOString() : null,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
  }));

  return (
    <div className="flex-1 space-y-6 w-full mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BriefcaseIcon className="size-6 text-primary" /> Background Jobs
          Console
        </h1>
        <p className="text-muted-foreground text-sm">
          SUPERADMIN Console: Monitor system tasks, retries, and check Dead
          Letter Queues (DLQ).
        </p>
      </div>

      <JobsClient
        initialJobs={serializedJobs}
        queueDepth={queueDepth}
        cacheHitRate={cacheHitRate}
      />
    </div>
  );
}
