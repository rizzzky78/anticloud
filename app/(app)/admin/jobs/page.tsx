import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { JobsClient } from "./jobs-client";
import { BriefcaseIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminJobsPage() {
  const session = await getCurrentUser();
  const currentUser = session?.user;

  // Jobs dashboard is restricted to SUPERADMIN
  if (!currentUser || currentUser.role !== "SUPERADMIN") {
    notFound();
  }

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
    <div className="flex-1 space-y-6 p-4 md:p-8 max-w-6xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BriefcaseIcon className="size-6 text-primary" /> Background Jobs Console
        </h1>
        <p className="text-muted-foreground text-sm">
          SUPERADMIN Console: Monitor system tasks, retries, and check Dead Letter Queues (DLQ).
        </p>
      </div>

      <JobsClient initialJobs={serializedJobs} />
    </div>
  );
}
