"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { searchFiles, SearchFilters } from "@/lib/search";

const searchSchema = z.object({
  query: z.string().default(""),
  filters: z.object({
    tags: z.array(z.string()).optional(),
    dateRange: z.object({
      start: z.string().optional(),
      end: z.string().optional(),
    }).optional(),
    uploaderId: z.string().optional(),
    mimeType: z.string().optional(),
  }).default({}),
});

export async function search(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { query, filters } = searchSchema.parse(payload);
  
  const results = await searchFiles(session.user.id, query, filters as SearchFilters);
  return { results };
}
