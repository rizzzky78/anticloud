@AGENTS.md

# Claude - AI Coding Assistant

## 🔒 RULES & SECURITY (ABSOLUTE PRIORITY)

1. **Never Hardcode Secrets**: Process.env ONLY. No hardcoded values. All secrets must be environment variables.
2. **Authentication**: Use Better-Auth for all authentication. Do not implement custom auth.
3. **Database Security**: Use prepared statements/Prisma. No SQL injection vulnerabilities.
4. **Sanitization**: Sanitize all user inputs (client-side + server-side).
5. **Error Handling**: Graceful error handling. Never expose stack traces to users.

## 💻 STACK & CONVENTIONS

- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components, never modify, use existing color scheme UIs
- **ORM**: Prisma (for PostgreSQL)
- **Auth**: Better-Auth
- **Storage**: MinIO (S3-compatible)

## 📝 FILE NAMING & STRUCTURE

- **Files**: kebab-case (e.g., `user-profile.tsx`)
- **Components**: PascalCase (e.g., `UserProfile`)
- **Server Actions**: `actions/` directory
- **Utils**: `lib/` directory
- **API Routes**: `app/api/` directory

## 🗺️ IMPLEMENTATION PLAN

- Plan lives in [`plan/`](plan/README.md) — one file per phase, worked **in order** (deps in the index table).
- Each numbered step = one agent action with its own acceptance criteria. Do only the step's deliverables.
- Track work in [`PROGRESS.md`](PROGRESS.md): tick a step when its acceptance criteria pass. Don't start a phase whose deps are unchecked.- No need do type check, lint or build after changes
- Lte user do cmd like `bunx prisma migrate/generate`
- always use Bun to install npm packages
