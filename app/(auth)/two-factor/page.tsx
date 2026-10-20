"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Second sign-in step for accounts with two-factor authentication. */
export default function TwoFactorPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [loading, setLoading] = useState(false);

  const finish = () => {
    router.push("/files");
    router.refresh();
  };

  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    const { error } =
      mode === "totp"
        ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
        : await authClient.twoFactor.verifyBackupCode({ code: backupCode.trim(), trustDevice });
    setLoading(false);

    if (error) {
      if (error.status === 429) {
        toast.error("Too many attempts. Please wait a moment and try again.");
      } else if (error.status === 401) {
        toast.error("Your sign-in expired. Please sign in again.");
        router.push("/sign-in");
      } else {
        toast.error(mode === "totp" ? "Invalid code. Try again." : "Invalid backup code.");
      }
      return;
    }
    finish();
  };

  const canSubmit = mode === "totp" ? code.length === 6 : backupCode.trim().length >= 6;

  return (
    <Card className="w-full max-w-sm border-white/10 bg-white/5 ring-white/10 shadow-2xl backdrop-blur-xl supports-[backdrop-filter]:bg-white/5">
      <form onSubmit={verify}>
        <CardHeader className="mb-6">
          <CardTitle className="text-2xl">Two-factor check</CardTitle>
          <CardDescription>
            {mode === "totp"
              ? "Enter the 6-digit code from your authenticator app."
              : "Enter one of the backup codes you saved when enabling two-factor."}
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          {mode === "totp" ? (
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={setCode}
                inputMode="numeric"
                autoFocus
                onComplete={() => setTimeout(() => verify(), 0)}
              >
                <InputOTPGroup>
                  {Array.from({ length: 6 }, (_, i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          ) : (
            <Input
              value={backupCode}
              onChange={(e) => setBackupCode(e.target.value)}
              placeholder="xxxxx-xxxxx"
              autoComplete="one-time-code"
              autoFocus
            />
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="trust-device"
              checked={trustDevice}
              onCheckedChange={(v) => setTrustDevice(!!v)}
            />
            <Label htmlFor="trust-device" className="text-sm font-normal">
              Trust this device for 30 days
            </Label>
          </div>
        </CardContent>

        <CardFooter className="mt-6 flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading || !canSubmit}>
            {loading ? <Spinner /> : "Verify"}
          </Button>
          <Button
            type="button"
            variant="link"
            className="text-white/70"
            onClick={() => setMode(mode === "totp" ? "backup" : "totp")}
          >
            {mode === "totp" ? "Use a backup code instead" : "Use the authenticator app instead"}
          </Button>
          <Link href="/sign-in" className="text-xs text-white/60 hover:text-white">
            Back to sign in
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
