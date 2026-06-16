/**
 * create-superadmin.ts — provision (or promote) a SUPERADMIN account.
 *
 * Use this for first-time app setup (bootstrapping the very first privileged
 * account before any sign-up UI is reachable) or whenever a developer needs to
 * mint / elevate an admin out-of-band.
 *
 * The user is created through Better-Auth's own server API (`auth.api.signUpEmail`)
 * so the password is hashed with the exact same scheme the sign-in flow verifies
 * against — never write a hash by hand. After creation the row's `role` is set to
 * the requested level (default SUPERADMIN) directly via Prisma, since the public
 * sign-up path always lands on the default role.
 *
 * Credentials are resolved in this order, per field:
 *   1. CLI flag          --email / --password / --name / --username / --role
 *   2. Environment var    SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD /
 *                         SUPERADMIN_NAME / SUPERADMIN_USERNAME / SUPERADMIN_ROLE
 *   3. Interactive prompt (password input is masked)
 *
 * Examples:
 *   bun run scripts/create-superadmin.ts
 *   bun run scripts/create-superadmin.ts --email admin@x.io --name "Root" --username root
 *   SUPERADMIN_EMAIL=a@x.io SUPERADMIN_PASSWORD=... bun run scripts/create-superadmin.ts --yes
 *   bun run scripts/create-superadmin.ts --email existing@x.io --promote
 *
 * Flags:
 *   --email, --password, --name, --username, --role   field values
 *   --promote   if the email already exists, elevate that account's role
 *               instead of failing (no new account is created)
 *   --yes, -y   non-interactive: never prompt; error if a required field is missing
 *   --help, -h  show this help
 */

import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { z } from "zod";
import { Role } from "@prisma/client";
import { auth } from "../lib/auth";
import { db } from "../lib/db";

// ── Arg parsing ──────────────────────────────────────────────────────────────

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("-")) continue;
    const key = arg.replace(/^--?/, "");
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("-")) {
      flags[key] = true; // boolean flag
    } else {
      flags[key] = next;
      i++;
    }
  }
  return flags;
}

const flags = parseArgs(process.argv.slice(2));

if (flags.help || flags.h) {
  // The module header doubles as the help text.
  console.log(
    [
      "Provision or promote a SUPERADMIN account.",
      "",
      "Usage: bun run scripts/create-superadmin.ts [flags]",
      "",
      "  --email <email>        account email",
      "  --password <password>  account password (min 8 chars)",
      "  --name <name>          display name",
      "  --username <username>  username (a-z0-9_. , 3-30 chars; derived from email if omitted)",
      "  --role <role>          SUPERADMIN | ADMIN | VIEWER | GUEST  (default SUPERADMIN)",
      "  --promote              elevate an existing account instead of failing",
      "  --yes, -y              non-interactive (no prompts)",
      "  --help, -h             show this help",
      "",
      "Fields fall back to SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD / SUPERADMIN_NAME /",
      "SUPERADMIN_USERNAME / SUPERADMIN_ROLE env vars, then to interactive prompts.",
    ].join("\n"),
  );
  process.exit(0);
}

const nonInteractive = Boolean(flags.yes || flags.y);
const promote = Boolean(flags.promote);

/** A user-facing, already-formatted failure. Distinguished from bugs below. */
class CliError extends Error {}

function fail(message: string): never {
  throw new CliError(message);
}

// ── Prompt helpers ───────────────────────────────────────────────────────────

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Prompt without echoing the typed characters (for secrets). */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    let muted = false;
    const mutedOut = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) process.stdout.write(chunk, encoding);
        callback();
      },
    });
    const rl = createInterface({
      input: process.stdin,
      output: mutedOut,
      terminal: true,
    });
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
    muted = true; // hide everything typed after the question is printed
  });
}

/**
 * Resolve one field: CLI flag → env var → prompt. Returns undefined only in
 * non-interactive mode when nothing is supplied (caller decides if required).
 */
async function resolveField(
  flagValue: string | boolean | undefined,
  envValue: string | undefined,
  promptText: string,
  opts: { secret?: boolean } = {},
): Promise<string | undefined> {
  if (typeof flagValue === "string" && flagValue.length > 0) return flagValue;
  if (envValue && envValue.length > 0) return envValue;
  if (nonInteractive) return undefined;
  return opts.secret ? promptHidden(promptText) : prompt(promptText);
}

// ── Validation ───────────────────────────────────────────────────────────────

const credentialsSchema = z.object({
  email: z.email({ message: "must be a valid email address" }),
  password: z.string().min(8, "must be at least 8 characters"),
  name: z.string().min(1, "is required"),
  username: z
    .string()
    .min(3, "must be at least 3 characters")
    .max(30, "must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_.]+$/, "may only contain letters, numbers, '_' and '.'"),
  role: z.enum(Role).default(Role.SUPERADMIN),
});

/** Derive a valid username from an email local-part when none was provided. */
function deriveUsername(email: string): string {
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[^a-zA-Z0-9_.]/g, "").slice(0, 30);
  return cleaned.length >= 3 ? cleaned : `${cleaned}admin`.slice(0, 30);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("→ anticloud: create / promote SUPERADMIN\n");

  const email = await resolveField(flags.email, process.env.SUPERADMIN_EMAIL, "Email: ");
  if (!email) fail("email is required (pass --email, set SUPERADMIN_EMAIL, or run interactively)");

  // If the account already exists, only the --promote path is allowed.
  const existing = await db.user.findUnique({ where: { email } });

  const roleRaw =
    (typeof flags.role === "string" ? flags.role : undefined) ??
    process.env.SUPERADMIN_ROLE ??
    Role.SUPERADMIN;

  if (existing) {
    if (!promote) {
      fail(
        `a user with email "${email}" already exists. ` +
          `Re-run with --promote to elevate that account's role.`,
      );
    }
    const roleParsed = z.enum(Role).safeParse(roleRaw);
    if (!roleParsed.success) fail(`invalid role "${roleRaw}". Use one of: ${Object.values(Role).join(", ")}`);
    const role = roleParsed.data;

    const updated = await db.user.update({
      where: { id: existing.id },
      data: { role },
    });
    console.log(`✅ Promoted existing account.`);
    report(updated.id, updated.email, updated.username, updated.role);
    return;
  }

  // ── New account: gather the rest of the fields. ──
  const password = await resolveField(
    flags.password,
    process.env.SUPERADMIN_PASSWORD,
    "Password (min 8): ",
    { secret: true },
  );
  const name = await resolveField(flags.name, process.env.SUPERADMIN_NAME, "Display name: ");
  let username = await resolveField(flags.username, process.env.SUPERADMIN_USERNAME, "Username (blank = derive from email): ");
  if (!username && email) username = deriveUsername(email);

  const parsed = credentialsSchema.safeParse({ email, password, name, username, role: roleRaw });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    fail(`invalid input:\n${issues}`);
  }
  const creds = parsed.data;

  // Guard against a username collision (Better-Auth would reject, but a clear
  // message here beats a generic API error).
  const usernameTaken = await db.user.findFirst({
    where: { username: creds.username.toLowerCase() },
    select: { id: true },
  });
  if (usernameTaken) fail(`username "${creds.username}" is already taken. Pass a different --username.`);

  // Create the user via Better-Auth so the credential account + password hash
  // are written exactly as the sign-in flow expects.
  let createdUserId: string;
  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: creds.email,
        password: creds.password,
        name: creds.name,
        username: creds.username,
      },
    });
    createdUserId = result.user.id;
  } catch (err) {
    fail(`Better-Auth rejected the sign-up: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Public sign-up always lands on the default role — elevate to the target.
  const finalUser = await db.user.update({
    where: { id: createdUserId! },
    data: { role: creds.role },
  });

  console.log(`✅ Created account and set role.`);
  report(finalUser.id, finalUser.email, finalUser.username, finalUser.role);
}

function report(id: string, email: string, username: string | null, role: Role) {
  console.log("");
  console.log(`   id:       ${id}`);
  console.log(`   email:    ${email}`);
  console.log(`   username: ${username ?? "(none)"}`);
  console.log(`   role:     ${role}`);
  console.log("");
  console.log("Sign in with the email/username + password above.");
}

main()
  .then(async () => {
    await db.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    if (err instanceof CliError) {
      console.error(`\n✗ ${err.message}\n`);
    } else {
      console.error("\n✗ Unexpected error:", err instanceof Error ? err.message : err);
    }
    await db.$disconnect().catch(() => {});
    process.exit(1);
  });
