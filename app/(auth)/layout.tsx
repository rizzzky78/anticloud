import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-context";
import { CloudIcon, HeartIcon } from "lucide-react";
import { AuthBackgroundCarousel } from "./auth-background-carousel";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentUser();
  if (session) redirect("/files");

  return (
    <div className="dark relative flex min-h-screen flex-col items-center justify-center p-4 text-foreground">
      <AuthBackgroundCarousel />

      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/90 text-primary-foreground shadow-lg ring-1 ring-white/20 backdrop-blur-sm">
          <CloudIcon className="size-5" />
        </div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-white drop-shadow-sm">
          Anticloud
        </h1>
        <p className="text-sm text-white/70">Secure file management platform</p>
      </div>
      {children}

      <footer className="mt-8 flex items-center gap-1.5 text-xs text-white/60">
        <span>made with</span>
        <HeartIcon className="size-3.5 fill-rose-500 text-rose-500" />
        <span>by</span>
        <a
          href="https://codebyrzky.site"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-white/80 underline-offset-4 transition-colors hover:text-white hover:underline"
        >
          codebyrzky
        </a>
      </footer>
    </div>
  );
}
