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

  // MinIO — consumed only by `lib/storage.ts`.
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

  // Better-Auth.
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "must be at least 32 characters"),
  BETTER_AUTH_URL: z.url({ message: "must be a valid URL" }),

  // Application.
  APP_URL: z.url({ message: "must be a valid URL" }),
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
