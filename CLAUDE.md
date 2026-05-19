@AGENTS.md

# Claude - AI Coding Assistant

## 🔒 RULES & SECURITY (ABSOLUTE PRIORITY)

1. **Never Hardcode Secrets**: Process.env ONLY. No hardcoded values. All secrets must be environment variables.
2. **Secure Defaults**: Default to secure settings (e.g., HTTPS, auth security, rate limiting).
3. **Authentication**: Use Better-Auth for all authentication. Do not implement custom auth.
4. **Database Security**: Use prepared statements/Prisma. No SQL injection vulnerabilities.
5. **Sanitization**: Sanitize all user inputs (client-side + server-side).
6. **Error Handling**: Graceful error handling. Never expose stack traces to users.

## 💻 STACK & CONVENTIONS

- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **ORM**: Prisma (for PostgreSQL)
- **Auth**: Better-Auth
- **Storage**: MinIO (S3-compatible)

## 📝 FILE NAMING & STRUCTURE

- **Files**: kebab-case (e.g., `user-profile.tsx`, `auth-guard.tsx`)
- **Components**: PascalCase (e.g., `UserProfile`, `AuthGuard`)
- **Pages**: Next.js convention (e.g., `app/dashboard/page.tsx`)
- **Server Actions**: `actions/` directory
- **Utils**: `lib/` directory
- **API Routes**: `app/api/` directory

## 🧪 TESTING PROTOCOL (NOT YET)

- **Unit Tests**: Vitest (src/tests/)
- **Mocking**: Mock all external dependencies (API calls, database, storage)
- **Coverage**: Aim for 80%+ coverage on business logic
- **Test Data**: Use test data generation utilities for consistent test states
