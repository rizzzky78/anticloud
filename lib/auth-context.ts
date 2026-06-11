import { auth } from "@/lib/auth";
import { headers } from "next/headers";

/**
 * The real security gate. Every protected Server Action / route handler / RSC calls this.
 */
export async function getCurrentUser() {
  return await auth.api.getSession({
    headers: await headers()
  });
}
