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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import {
  User,
  Sun,
  Moon,
  Monitor,
  LogOut,
  Shield,
  Mail,
  CircleUser,
  KeyRound,
  Laptop,
} from "lucide-react";

const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Letters, numbers, underscores, and hyphens only"),
});

export default function SettingsPage() {
  const { data: session, isPending: sessionLoading } = useSession();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [errors, setErrors] = useState<{ name?: string; username?: string }>({});
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name || "");
      // Better-Auth stores username in username field
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
      // 1. Update Name
      if (name !== user.name) {
        const { error } = await authClient.updateUser({ name });
        if (error) throw new Error(error.message || "Failed to update name");
      }

      // 2. Update Username (if plugin endpoint available)
      if (username !== userObj.username) {
        if (typeof authClient.changeUsername === "function") {
          const { error } = await authClient.changeUsername({ newUsername: username });
          if (error) throw new Error(error.message || "Failed to update username");
        } else {
          toast.warning("Username update not fully supported by auth client configuration.");
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
    } catch (err: any) {
      toast.error("Failed to sign out");
      setIsSigningOut(false);
    }
  };

  const getInitials = (n: string) => {
    return n
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  return (
    <div className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 space-y-6">
      <div className="space-y-1 text-left">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CircleUser className="size-6 text-primary" /> Settings & Account
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage your personal details, theme preferences, and active sessions.
        </p>
      </div>

      <Tabs defaultValue="profile" className="w-full space-y-6">
        <TabsList className="grid w-full max-w-[400px] grid-cols-3 h-10">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        {/* Profile Tab Content */}
        <TabsContent value="profile" className="outline-hidden">
          <Card className="border shadow-xs">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Profile Details</CardTitle>
              <CardDescription>
                Update your display name and username.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleUpdateProfile}>
              <CardContent className="space-y-6">
                <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-lg bg-muted/20 border">
                  <Avatar className="h-16 w-16 text-lg">
                    <AvatarImage src={user.image ?? ""} alt={user.name} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-1.5 text-center sm:text-left">
                    <h3 className="text-sm font-semibold text-foreground">{user.name}</h3>
                    <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                      <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[10px] uppercase font-bold py-0.5">
                        Role: {user.role}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider py-0.5 text-muted-foreground">
                        ID: {user.id.slice(0, 10)}...
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={!!errors.name}>
                    <FieldLabel htmlFor="name">Full Name</FieldLabel>
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={updatingProfile}
                    />
                    <FieldError>{errors.name}</FieldError>
                  </Field>

                  <Field data-invalid={!!errors.username}>
                    <FieldLabel htmlFor="username">Username</FieldLabel>
                    <Input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={updatingProfile}
                    />
                    <FieldError>{errors.username}</FieldError>
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="email" className="flex items-center gap-1.5 text-muted-foreground">
                      <Mail className="size-3.5" /> Email Address
                    </FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      value={user.email}
                      disabled
                      className="bg-muted/50 cursor-not-allowed border-muted-foreground/20 text-muted-foreground"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Email address cannot be changed in this version.</p>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="role" className="flex items-center gap-1.5 text-muted-foreground">
                      <Shield className="size-3.5" /> Security Role
                    </FieldLabel>
                    <Input
                      id="role"
                      type="text"
                      value={user.role || "VIEWER"}
                      disabled
                      className="bg-muted/50 cursor-not-allowed border-muted-foreground/20 text-muted-foreground"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Role is governed by system administrators.</p>
                  </Field>
                </div>
              </CardContent>
              <CardFooter className="border-t bg-muted/10 justify-end py-3 px-6">
                <Button type="submit" disabled={updatingProfile || (name === user.name && username === userObj.username)} className="shadow-xs cursor-pointer">
                  {updatingProfile ? (
                    <>
                      <Spinner className="mr-2" />
                      Saving changes…
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        {/* Appearance Tab Content */}
        <TabsContent value="appearance" className="outline-hidden">
          <Card className="border shadow-xs">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Appearance Theme</CardTitle>
              <CardDescription>
                Customize how Anticloud looks on your device.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  onClick={() => setTheme("light")}
                  className="h-20 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all border border-border"
                >
                  <Sun className="size-5 text-amber-500" />
                  <span className="text-xs font-semibold">Light Theme</span>
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  onClick={() => setTheme("dark")}
                  className="h-20 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all border border-border"
                >
                  <Moon className="size-5 text-indigo-400" />
                  <span className="text-xs font-semibold">Dark Theme</span>
                </Button>
                <Button
                  variant={theme === "system" ? "default" : "outline"}
                  onClick={() => setTheme("system")}
                  className="h-20 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all border border-border"
                >
                  <Laptop className="size-5 text-muted-foreground" />
                  <span className="text-xs font-semibold">System Default</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account Tab Content */}
        <TabsContent value="account" className="outline-hidden">
          <Card className="border shadow-xs">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Account Security</CardTitle>
              <CardDescription>
                View active session status or sign out of your account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Session Details</p>
                <div className="p-4 rounded-lg border bg-muted/20 space-y-2.5 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span className="font-medium">Account ID</span>
                    <span className="font-mono text-foreground">{user.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Logged In Since</span>
                    <span className="text-foreground">{new Date(user.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">System Role Authorization</span>
                    <span className="font-semibold text-primary uppercase">{user.role}</span>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6 space-y-4">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold text-foreground">Sign Out</h4>
                  <p className="text-xs text-muted-foreground">End your current session on this browser.</p>
                </div>
                <Button
                  variant="destructive"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="gap-2 cursor-pointer shadow-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isSigningOut ? (
                    <>
                      <Spinner className="mr-2" /> Signing out...
                    </>
                  ) : (
                    <>
                      <LogOut className="size-4" /> Sign Out
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
