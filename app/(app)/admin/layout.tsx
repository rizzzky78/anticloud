import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-context";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentUser();
  
  if (!session) {
    redirect("/sign-in");
  }

  const role = session.user.role as string | undefined;
  const isAdmin = role === "ADMIN" || role === "SUPERADMIN";

  if (!isAdmin) {
    notFound();
  }

  return <>{children}</>;
}
