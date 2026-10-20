"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createUserAccount } from "@/actions/admin-users";

type NewRole = "SUPERADMIN" | "ADMIN" | "VIEWER" | "GUEST";

/** "Add user" button + dialog for administrators. */
export function AdminCreateUserDialog({ canCreateSuperadmin }: { canCreateSuperadmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<NewRole>("VIEWER");
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    setName("");
    setEmail("");
    setUsername("");
    setPassword("");
    setRole("VIEWER");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        await createUserAccount({
          name,
          email,
          username: username || undefined,
          password,
          role,
        });
        toast.success(`Account created for ${name}`);
        setOpen(false);
        reset();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create account");
      }
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <UserPlus className="size-4" /> Add user
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Add user</DialogTitle>
              <DialogDescription>
                Create an account with an initial password. Share it with the person and ask them
                to change it under Settings.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="new-name" className="text-xs">Full name</Label>
                <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-email" className="text-xs">Email</Label>
                <Input id="new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-username" className="text-xs">Username (optional)</Label>
                <Input id="new-username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-xs">Initial password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as NewRole)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {canCreateSuperadmin && <SelectItem value="SUPERADMIN">Superadmin</SelectItem>}
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="VIEWER">Viewer</SelectItem>
                    <SelectItem value="GUEST">Guest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !name.trim() || !email.trim() || password.length < 8}>
                {isPending ? <Loader2 className="size-4 animate-spin" /> : "Create account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
