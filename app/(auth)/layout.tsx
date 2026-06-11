import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-context";
import { CloudIcon } from "lucide-react";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentUser();
  if (session) redirect("/files");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <CloudIcon className="size-5" />
        </div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Anticloud
        </h1>
        <p className="text-sm text-muted-foreground">
          Secure file management platform
        </p>
      </div>
      {children}
    </div>
  );
}
