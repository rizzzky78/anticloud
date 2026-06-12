"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { toast } from "sonner";
import { AlertCircleIcon } from "lucide-react";

const schema = z.object({
  credential: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});

type FormErrors = Partial<Record<keyof z.infer<typeof schema>, string>>;

export default function SignInPage() {
  const router = useRouter();
  const [credential, setCredential] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsRateLimited(false);

    const parsed = schema.safeParse({ credential, password });
    if (!parsed.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormErrors;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    const isEmail = credential.includes("@");
    const authCall = isEmail
      ? signIn.email({ email: credential, password })
      : signIn.username({ username: credential, password });

    const { error } = await authCall;
    setLoading(false);

    if (error) {
      if (error.status === 429) {
        setIsRateLimited(true);
      } else {
        toast.error("Sign in failed. Please check your credentials.");
      }
    } else {
      router.push("/files");
      router.refresh();
    }
  };

  return (
    <Card className="w-full max-w-sm border-white/10 bg-white/5 ring-white/10 shadow-2xl backdrop-blur-xl supports-[backdrop-filter]:bg-white/5">
      <form onSubmit={handleSubmit}>
        <CardHeader className="mb-8">
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            Enter your email or username to access your account.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          {isRateLimited && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Too many attempts</AlertTitle>
              <AlertDescription>
                You've been rate limited. Please wait a moment before trying
                again.
              </AlertDescription>
            </Alert>
          )}

          <Field data-invalid={!!errors.credential}>
            <FieldLabel htmlFor="credential">Email or Username</FieldLabel>
            <Input
              id="credential"
              type="text"
              placeholder="your@email.com"
              autoComplete="username"
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
            />
            <FieldError>{errors.credential}</FieldError>
          </Field>

          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="your super secret password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <FieldError>{errors.password}</FieldError>
          </Field>
        </CardContent>

        <CardFooter className="flex-col gap-4 mt-12">
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? (
              <>
                <Spinner className="mr-2" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/sign-up" className="underline hover:text-primary">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
