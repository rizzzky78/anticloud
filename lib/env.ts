import { z } from "zod";

/**
 * Environment contract.
 *
 * This is the ONLY module in the codebase that reads `process.env`. Everything
 * else imports the typed `env` object below. The schema is parsed once at module
 * load: a missing or invalid variable throws immediately with a readable list of
 * problems, so the process fails fast instead of crashing deep in a request.
 *
 * @see ../.env.example for documentation of every variable.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // PostgreSQL — consumed by the Prisma driver adapter in `lib/db.ts`.
  DATABASE_URL: z.url({ message: "must be a valid postgres connection URL" }),

  // Redis / Dragonfly — consumed by `lib/redis.ts`.
  REDIS_URL: z.url({ message: "must be a valid redis connection URL" }),

  // Object storage (S3-compatible) — consumed only by `lib/storage.ts`.
  // The `minio` SDK speaks plain S3, so the SAME variables point at either a
  // local MinIO server OR a cloud provider (Cloudflare R2, AWS S3, Backblaze
  // B2, …). Only the endpoint/port/SSL change; for cloud you additionally set
  // MINIO_REGION (and usually MINIO_USE_SSL=true, MINIO_PORT=443).
  MINIO_ENDPOINT: z.string().min(1, "is required"),
  MINIO_PORT: z.coerce
    .number()
    .int("must be an integer")
    .min(1, "must be a valid port")
    .max(65535, "must be a valid port"),
  MINIO_ACCESS_KEY: z.string().min(1, "is required"),
  MINIO_SECRET_KEY: z.string().min(1, "is required"),
  MINIO_BUCKET: z.string().min(1, "is required"),
  MINIO_USE_SSL: z.stringbool().default(false),
  // Optional — only needed for cloud storage. Examples: "auto" (R2),
  // "us-east-1" (AWS). Leave unset for a local MinIO server.
  MINIO_REGION: z.string().min(1).optional(),
  // Optional — addressing style. Local MinIO & R2 use path-style (default true
  // for non-AWS endpoints in the SDK); AWS S3 uses virtual-hosted style. Only
  // set this to override the SDK's auto-detection.
  MINIO_PATH_STYLE: z.stringbool().optional(),

  // Better-Auth.
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "must be at least 32 characters"),
  BETTER_AUTH_URL: z.url({ message: "must be a valid URL" }),

  // Application.
  APP_URL: z.url({ message: "must be a valid URL" }),
  CRON_SECRET: z.string().default("development_secret_change_me"),
});

/** Inferred, fully-typed shape of the validated environment. */
export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid environment configuration. Fix the following variable(s):\n${issues}\n` +
        `See .env.example for the full contract.`,
    );
  }

  return result.data;
}

/** Validated, typed environment. Import this — never read `process.env` elsewhere. */
export const env: Env = parseEnv();
