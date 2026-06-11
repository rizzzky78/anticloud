"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";

/**
 * Search users by name, email, or username.
 * Primarily used by the Mentions Manager and Sharing controls.
 */
export async function searchUsers(query: string) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const trimmed = query.trim();
  if (!trimmed) return [];

  return db.user.findMany({
    where: {
      OR: [
        { name: { contains: trimmed, mode: "insensitive" } },
        { email: { contains: trimmed, mode: "insensitive" } },
        { username: { contains: trimmed, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      username: true,
      role: true,
    },
    take: 10,
  });
}
