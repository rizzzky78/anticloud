"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useSession, authClient, signOut } from "@/lib/auth-client";
import { toast } from "sonner";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  Sun,
  Moon,
  LogOut,
  Shield,
  Mail,
  CircleUser,
  Laptop,
  KeyRound,
  Clock,
} from "lucide-react";

const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Letters, numbers, underscores, and hyphens only",
    ),
});

export default function SettingsPage() {
  const { data: session, isPending: sessionLoading } = useSession();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [errors, setErrors] = useState<{ name?: string; username?: string }>(
    {},
  );
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name || "");
      const userObj = session.user as any;
      setUsername(userObj.username || "");
    }
  }, [session]);

  if (sessionLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[300px]">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }

  if (!session) {
    router.push("/sign-in");
    return null;
  }

  const user = session.user;
  const userObj = user as any;

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parsed = profileSchema.safeParse({ name, username });
    if (!parsed.success) {
      const fieldErrors: typeof errors = {};
      parsed.error.issues.forEach((issue) => {
        const path = issue.path[0] as keyof typeof errors;
        fieldErrors[path] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setUpdatingProfile(true);
    const toastId = toast.loading("Updating profile...");

    try {
      if (name !== user.name) {
        const { error } = await authClient.updateUser({ name });
        if (error) throw new Error(error.message || "Failed to update name");
      }

      if (username !== userObj.username) {
        const client = authClient as any;
        if (typeof client.changeUsername === "function") {
          const { error } = await client.changeUsername({
            newUsername: username,
          });
          if (error)
            throw new Error(error.message || "Failed to update username");
        } else {
          toast.warning(
            "Username update not fully supported by auth client configuration.",
          );
        }
      }

      toast.success("Profile updated successfully!", { id: toastId });
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile", { id: toastId });
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      toast.success("Signed out successfully");
      router.push("/sign-in");
      router.refresh();
    } catch {
      toast.error("Failed to sign out");
      setIsSigningOut(false);
    }
  };

  const getInitials = (n: string) =>
    n
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  const isDirty = name !== user.name || username !== userObj.username;

  return (
    <div className="flex-1 w-full flex flex-col gap-4 lg:h-full lg:min-h-0">
      {/* Page title */}
      <div className="flex items-center gap-2.5">
        <CircleUser className="size-9 text-primary shrink-0 mb-0.5" />
        <div>
          <h1 className="text-lg font-semibold tracking-tight leading-none">
            Settings &amp; Account
          </h1>
          <p className="text-muted-foreground text-xs mt-1">
            Manage your personal details, appearance, and session.
          </p>
        </div>
      </div>

      {/* Main settings grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch lg:flex-1 lg:min-h-0">
        {/* Profile form — 2/3 width */}
        <Card className="border shadow-xs lg:col-span-2 flex flex-col">
          {/* Identity banner */}
          <div className="flex items-center gap-3.5 px-6 pt-5 pb-4">
            <Avatar className="size-12 shrink-0 text-base">
              <AvatarImage src={user.image ?? ""} alt={user.name} />
              <AvatarFallback className="bg-primary/10 text-primary font-bold">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="font-semibold text-lg text-foreground leading-tight truncate">
                {user.name}
              </p>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Mail className="size-3 shrink-0" />{" "}
                <span className="truncate">{user.email}</span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <Badge className="bg-primary/10 text-primary border-transparent text-[10px] uppercase font-bold py-0 px-2 h-4">
                {userObj.role}
              </Badge>
              <span className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="size-3" />
                Since {new Date(user.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <Separator />
          <form onSubmit={handleUpdateProfile} className="flex flex-1 flex-col">
            <CardContent className="pt-5 pb-5 px-6 space-y-4 flex-1">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.name}>
                  <FieldLabel htmlFor="name" className="text-xs font-medium">
                    Full Name
                  </FieldLabel>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={updatingProfile}
                    className="h-9 text-sm"
                  />
                  <FieldError className="text-[11px]">{errors.name}</FieldError>
                </Field>

                <Field data-invalid={!!errors.username}>
                  <FieldLabel
                    htmlFor="username"
                    className="text-xs font-medium"
                  >
                    Username
                  </FieldLabel>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={updatingProfile}
                    className="h-9 text-sm"
                  />
                  <FieldError className="text-[11px]">
                    {errors.username}
                  </FieldError>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel
                    htmlFor="email"
                    className="text-xs font-medium flex items-center gap-1 text-muted-foreground"
                  >
                    <Mail className="size-3" /> Email Address
                  </FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    value={user.email}
                    disabled
                    className="h-9 text-sm bg-muted/40 cursor-not-allowed disabled:bg-transparent text-muted-foreground"
                  />
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    Cannot be changed.
                  </p>
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="role"
                    className="text-xs font-medium flex items-center gap-1 text-muted-foreground"
                  >
                    <Shield className="size-3" /> Security Role
                  </FieldLabel>
                  <Input
                    id="role"
                    value={userObj.role || "VIEWER"}
                    disabled
                    className="h-9 text-sm bg-muted/40 cursor-not-allowed text-muted-foreground disabled:bg-transparent"
                  />
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    Managed by administrators.
                  </p>
                </Field>
              </div>
            </CardContent>
            <Separator />
            <div className="flex justify-end px-6 py-3">
              <Button
                type="submit"
                size="sm"
                disabled={updatingProfile || !isDirty}
                className="cursor-pointer min-w-[110px]"
              >
                {updatingProfile ? (
                  <>
                    <Spinner className="mr-1.5 size-3.5" /> Saving…
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </Card>

        {/* Right column */}
        <div className="flex flex-col gap-4 lg:min-h-0">
          {/* Appearance */}
          <Card className="border shadow-xs">
            <CardHeader className="pb-3 pt-5 px-6">
              <CardTitle className="text-sm font-semibold">
                Appearance
              </CardTitle>
              <CardDescription className="text-xs">
                Choose your preferred theme.
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4 pb-5 px-6">
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    value: "light",
                    label: "Light",
                    icon: <Sun className="size-4 text-amber-500" />,
                  },
                  {
                    value: "dark",
                    label: "Dark",
                    icon: <Moon className="size-4 text-indigo-400" />,
                  },
                  {
                    value: "system",
                    label: "System",
                    icon: <Laptop className="size-4 text-muted-foreground" />,
                  },
                ].map(({ value, label, icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    className={[
                      "flex flex-col items-center justify-center gap-2 rounded-lg border py-3 text-[11px] font-medium transition-all cursor-pointer",
                      theme === value
                        ? "border-primary bg-primary/8 text-primary ring-1 ring-primary/30"
                        : "border-border bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                    ].join(" ")}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Account Security */}
          <Card className="border shadow-xs flex flex-col lg:flex-1 lg:min-h-0">
            <CardHeader className="pb-3 pt-5 px-6">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <KeyRound className="size-3.5 text-muted-foreground" />
                Session
              </CardTitle>
              <CardDescription className="text-xs">
                Your active session details.
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4 pb-5 px-6 flex flex-1 flex-col">
              <dl className="space-y-2.5 text-xs flex-1">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground shrink-0">Status</dt>
                  <dd className="flex items-center gap-1 font-medium text-green-600 dark:text-green-400">
                    <span className="size-1.5 rounded-full bg-green-500 inline-block" />
                    Active
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground shrink-0">Role</dt>
                  <dd className="font-semibold text-primary uppercase">
                    {userObj.role}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground shrink-0">Since</dt>
                  <dd className="text-foreground text-right">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground shrink-0">ID</dt>
                  <dd className="font-mono text-foreground truncate">
                    {user.id}
                  </dd>
                </div>
              </dl>

              <Separator className="my-4" />

              <Button
                variant="destructive"
                size="sm"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="w-full gap-2 cursor-pointer"
              >
                {isSigningOut ? (
                  <>
                    <Spinner className="size-3.5" /> Signing out…
                  </>
                ) : (
                  <>
                    <LogOut className="size-3.5" /> Sign Out
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
