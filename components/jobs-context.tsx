"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { getJob } from "@/actions/jobs";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";

export interface JobItem {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  result: any;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface JobsContextType {
  jobs: JobItem[];
  isDrawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  addJob: (jobId: string) => void;
  clearJobs: () => void;
}

const JobsContext = createContext<JobsContextType | undefined>(undefined);

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [jobIds, setJobIds] = useState<string[]>([]);
  
  // Keep track of job statuses to detect transitions for toast alerts
  const prevStatusesRef = useRef<Record<string, string>>({});

  // 1. Load job IDs from localStorage on mount / user change
  useEffect(() => {
    if (!userId) return;
    try {
      const stored = localStorage.getItem(`anticloud:recent-jobs:${userId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        setJobIds(parsed);
      } else {
        setJobIds([]);
        setJobs([]);
      }
    } catch (e) {
      console.error("Failed to load jobs from localStorage", e);
    }
  }, [userId]);

  // 2. Save job IDs to localStorage when they change
  const saveJobIds = (ids: string[]) => {
    if (!userId) return;
    try {
      localStorage.setItem(`anticloud:recent-jobs:${userId}`, JSON.stringify(ids));
    } catch (e) {
      console.error("Failed to save jobs to localStorage", e);
    }
  };

  // 3. Fetch jobs metadata for all tracked job IDs
  const fetchAllJobs = async (idsToFetch: string[]) => {
    if (idsToFetch.length === 0) {
      setJobs([]);
      return;
    }

    const fetchedJobs: JobItem[] = [];
    const invalidIds: string[] = [];

    await Promise.all(
      idsToFetch.map(async (id) => {
        try {
          const job = await getJob({ jobId: id });
          fetchedJobs.push(job);
        } catch (err) {
          console.error(`Failed to fetch job ${id}`, err);
          // If not found or access denied, don't break the whole loop, just skip
          invalidIds.push(id);
        }
      })
    );

    // Filter out invalid job IDs
    if (invalidIds.length > 0) {
      const cleanIds = idsToFetch.filter((id) => !invalidIds.includes(id));
      setJobIds(cleanIds);
      saveJobIds(cleanIds);
    }

    // Sort fetched jobs by createdAt descending
    fetchedJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    // Check for transitions and trigger toast alerts
    fetchedJobs.forEach((job) => {
      const prevStatus = prevStatusesRef.current[job.id];
      if (prevStatus && prevStatus !== job.status) {
        if (job.status === "COMPLETED") {
          if (job.type === "BULK_ARCHIVE") {
            toast.success("Bulk download archive is ready!", {
              description: "Click below to download your files.",
              action: {
                label: "Download ZIP",
                onClick: () => {
                  if (job.result?.downloadUrl) {
                    window.location.href = job.result.downloadUrl;
                  }
                },
              },
              duration: 10000,
            });
          } else if (job.type === "COMPRESSION") {
            toast.success("Compression complete!", {
              description: "Your compressed derived file is ready.",
              action: {
                label: "View File",
                onClick: () => {
                  if (job.result?.derivedFileId) {
                    window.location.href = `/files/${job.result.derivedFileId}`;
                  }
                },
              },
              duration: 6000,
            });
          }
        } else if (job.status === "FAILED" || job.status === "DEAD_LETTER") {
          toast.error(`${job.type === "COMPRESSION" ? "Compression" : "Archive"} job failed`, {
            description: job.error || "An error occurred during execution.",
          });
        }
      }
      // Record new status
      prevStatusesRef.current[job.id] = job.status;
    });

    setJobs(fetchedJobs);
  };

  // Fetch all jobs whenever job IDs list changes
  useEffect(() => {
    if (jobIds.length > 0) {
      fetchAllJobs(jobIds);
    }
  }, [jobIds]);

  // 4. Polling interval for active jobs
  useEffect(() => {
    const activeJobs = jobs.filter(
      (job) => job.status === "PENDING" || job.status === "RUNNING"
    );

    if (activeJobs.length === 0) return;

    const interval = setInterval(() => {
      fetchAllJobs(jobIds);
    }, 3000);

    return () => clearInterval(interval);
  }, [jobs, jobIds]);

  const addJob = (jobId: string) => {
    if (jobIds.includes(jobId)) return;
    const nextIds = [jobId, ...jobIds].slice(0, 20); // Keep max 20 recent jobs
    setJobIds(nextIds);
    saveJobIds(nextIds);
  };

  const clearJobs = () => {
    setJobIds([]);
    setJobs([]);
    if (userId) {
      localStorage.removeItem(`anticloud:recent-jobs:${userId}`);
    }
    prevStatusesRef.current = {};
  };

  return (
    <JobsContext.Provider
      value={{
        jobs,
        isDrawerOpen,
        setDrawerOpen,
        addJob,
        clearJobs,
      }}
    >
      {children}
    </JobsContext.Provider>
  );
}

export function useJobs() {
  const context = useContext(JobsContext);
  if (context === undefined) {
    throw new Error("useJobs must be used within a JobsProvider");
  }
  return context;
}
