"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  Copy,
  KeyRound,
  Laptop,
  Loader2,
  LogOut,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { formatRelativeDate } from "@/lib/format";

const MIN_PASSWORD = 8;

interface SessionRow {
  id: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date | string;
  expiresAt: Date | string;
}

function describeAgent(ua?: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";
  return `${browser} on ${os}`;
}

function isMobile(ua?: string | null) {
  return !!ua && /Android|iPhone|iPad|Mobile/.test(ua);
}

// ─── Password ────────────────────────────────────────────────────────────────

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < MIN_PASSWORD) {
      toast.error(`New password must be at least ${MIN_PASSWORD} characters`);
      return;
    }
    if (next !== confirm) {
      toast.error("New passwords do not match");
      return;
    }
    setSaving(true);
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: revokeOthers,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Failed to change password");
      return;
    }
    toast.success("Password changed");
    setCurrent("");
    setNext("");
    setConfirm("");
  };

  return (
    <Card className="border shadow-xs">
      <CardHeader className="pb-3 pt-5 px-6">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <KeyRound className="size-4 text-primary" /> Password
        </CardTitle>
        <CardDescription className="text-xs">Change the password you sign in with.</CardDescription>
      </CardHeader>
      <CardContent className="px-6 pb-5">
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="current-password" className="text-xs">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={saving}
              className="h-9"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-xs">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                disabled={saving}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-xs">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={saving}
                className="h-9"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="revoke-others"
              checked={revokeOthers}
              onCheckedChange={(v) => setRevokeOthers(!!v)}
            />
            <Label htmlFor="revoke-others" className="text-xs font-normal">
              Sign out of all other devices
            </Label>
          </div>
          <Button type="submit" size="sm" disabled={saving || !current || !next || !confirm}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Two-factor ──────────────────────────────────────────────────────────────

type TwoFactorStep = "password" | "scan" | "codes";

function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"enable" | "disable" | "regenerate" | null>(null);
  const [step, setStep] = useState<TwoFactorStep>("password");
  const [password, setPassword] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep("password");
    setPassword("");
    setQr(null);
    setSecret(null);
    setCode("");
    setBackupCodes([]);
  };

  const close = () => {
    setDialog(null);
    reset();
    router.refresh();
  };

  const startEnable = async () => {
    setBusy(true);
    const { data, error } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (error || !data) {
      toast.error(error?.message || "Could not start two-factor setup");
      return;
    }
    setBackupCodes(data.backupCodes);
    try {
      setSecret(new URL(data.totpURI).searchParams.get("secret"));
    } catch {
      setSecret(null);
    }
    setQr(await QRCode.toDataURL(data.totpURI, { margin: 1, width: 200 }));
    setStep("scan");
  };

  const confirmEnable = async () => {
    setBusy(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (error) {
      toast.error("That code did not match. Check your app and try again.");
      return;
    }
    toast.success("Two-factor authentication is on");
    setStep("codes");
  };

  const disable = async () => {
    setBusy(true);
    const { error } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message || "Could not disable two-factor");
      return;
    }
    toast.success("Two-factor authentication is off");
    close();
  };

  const regenerate = async () => {
    setBusy(true);
    const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
    setBusy(false);
    if (error || !data) {
      toast.error(error?.message || "Could not generate backup codes");
      return;
    }
    setBackupCodes(data.backupCodes);
    setStep("codes");
  };

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      toast.success("Backup codes copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const passwordStep = (action: () => void, label: string) => (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="tf-password" className="text-xs">Confirm with your password</Label>
        <Input
          id="tf-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
        <Button onClick={action} disabled={busy || !password}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : label}
        </Button>
      </DialogFooter>
    </>
  );

  const codesStep = (
    <>
      <p className="text-sm text-muted-foreground">
        Save these one-time backup codes somewhere safe. Each can be used once if you lose
        access to your authenticator app.
      </p>
      <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 font-mono text-sm">
        {backupCodes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={copyCodes}>
          <Copy className="size-4 mr-1.5" /> Copy
        </Button>
        <Button onClick={close}>Done</Button>
      </DialogFooter>
    </>
  );

  return (
    <Card className="border shadow-xs">
      <CardHeader className="pb-3 pt-5 px-6">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <ShieldCheck className="size-4 text-primary" /> Two-factor authentication
          <Badge variant={enabled ? "default" : "outline"} className="ml-1 text-[10px]">
            {enabled ? "On" : "Off"}
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          Require a code from an authenticator app (Google Authenticator, Microsoft
          Authenticator, 1Password…) when you sign in.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6 pb-5 flex flex-wrap gap-2">
        {enabled ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setDialog("regenerate")}>
              New backup codes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setDialog("disable")}
            >
              <ShieldOff className="size-4 mr-1.5" /> Turn off
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setDialog("enable")}>
            <ShieldCheck className="size-4 mr-1.5" /> Turn on
          </Button>
        )}
      </CardContent>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog === "enable"
                ? "Set up two-factor authentication"
                : dialog === "disable"
                  ? "Turn off two-factor authentication"
                  : "Generate new backup codes"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "regenerate" && step === "password"
                ? "Your previous backup codes stop working."
                : dialog === "disable"
                  ? "Your account will be protected by your password only."
                  : " "}
            </DialogDescription>
          </DialogHeader>

          {dialog === "enable" && step === "password" && passwordStep(startEnable, "Continue")}
          {dialog === "enable" && step === "scan" && (
            <>
              <p className="text-sm text-muted-foreground">
                Scan this QR code with your authenticator app, then enter the 6-digit code it shows.
              </p>
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="Two-factor QR code" className="mx-auto size-48 rounded-lg border bg-white p-2" />
              )}
              {secret && (
                <p className="text-center text-xs text-muted-foreground">
                  Can&apos;t scan? Enter this key: <span className="font-mono break-all">{secret}</span>
                </p>
              )}
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={code} onChange={setCode} inputMode="numeric">
                  <InputOTPGroup>
                    {Array.from({ length: 6 }, (_, i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
                <Button onClick={confirmEnable} disabled={busy || code.length !== 6}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Verify and turn on"}
                </Button>
              </DialogFooter>
            </>
          )}
          {dialog === "disable" && passwordStep(disable, "Turn off")}
          {dialog === "regenerate" && step === "password" && passwordStep(regenerate, "Generate")}
          {step === "codes" && codesStep}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Sessions ────────────────────────────────────────────────────────────────

function SessionsCard({ currentToken }: { currentToken: string | null }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await authClient.listSessions();
    if (error) {
      toast.error(error.message || "Failed to load sessions");
      setSessions([]);
      return;
    }
    const rows = (data ?? []) as SessionRow[];
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setSessions(rows);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (token: string) => {
    setBusy(token);
    const { error } = await authClient.revokeSession({ token });
    setBusy(null);
    if (error) {
      toast.error(error.message || "Failed to sign out that device");
      return;
    }
    toast.success("Device signed out");
    load();
  };

  const revokeOthers = async () => {
    setBusy("others");
    const { error } = await authClient.revokeOtherSessions();
    setBusy(null);
    if (error) {
      toast.error(error.message || "Failed to sign out other devices");
      return;
    }
    toast.success("Signed out of all other devices");
    load();
    router.refresh();
  };

  const others = sessions?.filter((s) => s.token !== currentToken) ?? [];

  return (
    <Card className="border shadow-xs lg:col-span-2">
      <CardHeader className="pb-3 pt-5 px-6 flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Laptop className="size-4 text-primary" /> Active sessions
          </CardTitle>
          <CardDescription className="text-xs">
            Devices currently signed in to your account.
          </CardDescription>
        </div>
        {others.length > 0 && (
          <Button size="sm" variant="outline" onClick={revokeOthers} disabled={busy !== null}>
            {busy === "others" ? <Loader2 className="size-4 animate-spin" /> : "Sign out others"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="px-6 pb-5">
        {sessions === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading sessions…
          </div>
        ) : (
          <ul className="divide-y rounded-lg border">
            {sessions.map((s) => {
              const current = s.token === currentToken;
              const Icon = isMobile(s.userAgent) ? Smartphone : Laptop;
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="size-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{describeAgent(s.userAgent)}</span>
                        {current && <Badge variant="secondary" className="text-[10px]">This device</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {s.ipAddress || "Unknown IP"} · signed in {formatRelativeDate(new Date(s.createdAt).toISOString())}
                      </p>
                    </div>
                  </div>
                  {!current && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Sign out this device"
                      onClick={() => revoke(s.token)}
                      disabled={busy !== null}
                    >
                      {busy === s.token ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface AccountSecurityProps {
  twoFactorEnabled: boolean;
  currentSessionToken: string | null;
}

/** Password, two-factor and session management for the signed-in user. */
export function AccountSecurity({ twoFactorEnabled, currentSessionToken }: AccountSecurityProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <PasswordCard />
      <TwoFactorCard enabled={twoFactorEnabled} />
      <SessionsCard currentToken={currentSessionToken} />
    </div>
  );
}
