"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, KeyRound, Loader2, LogOut, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  deleteUserAccount,
  resetUserPassword,
  setUserDisabled,
  signOutUserEverywhere,
} from "@/actions/admin-users";

interface AdminUserActionsProps {
  user: { id: string; name: string; disabledAt: string | null };
  /** Other accounts that can receive this user's files on deletion. */
  transferCandidates: { id: string; name: string; email: string }[];
}

type DialogKind = "password" | "disable" | "delete" | null;

/** Per-user lifecycle actions in the admin users table. */
export function AdminUserActions({ user, transferCandidates }: AdminUserActionsProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [transferTo, setTransferTo] = useState("none");
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<unknown>, success: string) =>
    startTransition(async () => {
      try {
        await fn();
        toast.success(success);
        setDialog(null);
        setPassword("");
        setReason("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      }
    });

  const disabled = !!user.disabledAt;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" title="Account actions" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setDialog("password")}>
            <KeyRound className="size-4 mr-2" /> Reset password
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => run(() => signOutUserEverywhere({ userId: user.id }), `${user.name} was signed out everywhere`)}
          >
            <LogOut className="size-4 mr-2" /> Sign out everywhere
          </DropdownMenuItem>
          {disabled ? (
            <DropdownMenuItem
              onClick={() => run(() => setUserDisabled({ userId: user.id, disabled: false }), `${user.name} can sign in again`)}
            >
              <CheckCircle2 className="size-4 mr-2" /> Enable account
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setDialog("disable")}>
              <Ban className="size-4 mr-2" /> Disable account
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDialog("delete")}
          >
            <Trash2 className="size-4 mr-2" /> Delete account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          {dialog === "password" && (
            <>
              <DialogHeader>
                <DialogTitle>Reset password</DialogTitle>
                <DialogDescription>
                  Set a new password for {user.name}. They are signed out everywhere and should
                  change it after signing in.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="reset-password" className="text-xs">New password</Label>
                <Input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)} disabled={isPending}>Cancel</Button>
                <Button
                  onClick={() => run(() => resetUserPassword({ userId: user.id, password }), "Password reset")}
                  disabled={isPending || password.length < 8}
                >
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : "Reset password"}
                </Button>
              </DialogFooter>
            </>
          )}

          {dialog === "disable" && (
            <>
              <DialogHeader>
                <DialogTitle>Disable {user.name}?</DialogTitle>
                <DialogDescription>
                  They are signed out immediately and cannot sign in until re-enabled. Their files
                  stay where they are.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="disable-reason" className="text-xs">Reason (optional)</Label>
                <Input
                  id="disable-reason"
                  value={reason}
                  maxLength={280}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Left the company"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)} disabled={isPending}>Cancel</Button>
                <Button
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() =>
                    run(
                      () => setUserDisabled({ userId: user.id, disabled: true, reason: reason || undefined }),
                      `${user.name} was disabled`,
                    )
                  }
                  disabled={isPending}
                >
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : "Disable account"}
                </Button>
              </DialogFooter>
            </>
          )}

          {dialog === "delete" && (
            <>
              <DialogHeader>
                <DialogTitle>Delete {user.name}?</DialogTitle>
                <DialogDescription>
                  The account, its sessions, shares and memberships are removed permanently.
                  Choose who receives their files and folders, or leave them unowned.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label className="text-xs">Transfer files and folders to</Label>
                <Select value={transferTo} onValueChange={setTransferTo}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nobody (keep as unowned)</SelectItem>
                    {transferCandidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)} disabled={isPending}>Cancel</Button>
                <Button
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() =>
                    run(
                      () =>
                        deleteUserAccount({
                          userId: user.id,
                          transferToUserId: transferTo === "none" ? null : transferTo,
                        }),
                      `${user.name} was deleted`,
                    )
                  }
                  disabled={isPending}
                >
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : "Delete account"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
