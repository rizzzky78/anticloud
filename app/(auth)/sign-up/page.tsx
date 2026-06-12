"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { signUp } from "@/lib/auth-client";
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

const schema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username must be at most 30 characters")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Only letters, numbers, underscores, and hyphens allowed",
      ),
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain at least one uppercase letter")
      .regex(/[0-9]/, "Must contain at least one number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;
type FormErrors = Partial<Record<keyof FormValues, string>>;

export default function SignUpPage() {
  const router = useRouter();
  const [values, setValues] = useState<Omit<FormValues, never>>({
    name: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [loading, setLoading] = useState(false);

  const set =
    (field: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((v) => ({ ...v, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsRateLimited(false);

    const parsed = schema.safeParse(values);
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
    const { error } = await signUp.email({
      name: values.name,
      username: values.username,
      email: values.email,
      password: values.password,
    });
    setLoading(false);

    if (error) {
      if (error.status === 429) {
        setIsRateLimited(true);
      } else {
        toast.error("Sign up failed. Please try again.");
      }
    } else {
      router.push("/files");
      router.refresh();
    }
  };

  return (
    <Card className="w-full max-w-lg border-white/10 bg-white/5 ring-white/10 shadow-2xl backdrop-blur-xl supports-[backdrop-filter]:bg-white/5">
      <form onSubmit={handleSubmit}>
        <CardHeader className="mb-8">
          <CardTitle className="text-2xl">Create account</CardTitle>
          <CardDescription>
            Fill in the details below to get started.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          {isRateLimited && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Too many attempts</AlertTitle>
              <AlertDescription>
                You&apos;ve been rate limited. Please wait a moment before
                trying again.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Full Name</FieldLabel>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                value={values.name}
                onChange={set("name")}
              />
              <FieldError>{errors.name}</FieldError>
            </Field>

            <Field data-invalid={!!errors.username}>
              <FieldLabel htmlFor="username">Username</FieldLabel>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                value={values.username}
                onChange={set("username")}
              />
              <FieldError>{errors.username}</FieldError>
            </Field>
          </div>

          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              autoComplete="email"
              value={values.email}
              onChange={set("email")}
            />
            <FieldError>{errors.email}</FieldError>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="your super secret password"
                value={values.password}
                onChange={set("password")}
              />
              <FieldError>{errors.password}</FieldError>
            </Field>

            <Field data-invalid={!!errors.confirmPassword}>
              <FieldLabel htmlFor="confirmPassword">
                Confirm Password
              </FieldLabel>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="type your password again"
                value={values.confirmPassword}
                onChange={set("confirmPassword")}
              />
              <FieldError>{errors.confirmPassword}</FieldError>
            </Field>
          </div>
        </CardContent>

        <CardFooter className="flex-col gap-4 mt-12">
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? (
              <>
                <Spinner className="mr-2" />
                Creating account…
              </>
            ) : (
              "Create account"
            )}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            Already have an account?{" "}
            <Link href="/sign-in" className="underline hover:text-primary">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
