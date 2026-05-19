# Plan 01 — Authentication & RBAC

> **Phase**: 1 (Foundation)
> **Dependencies**: Docker Compose environment, Next.js scaffold
> **Estimated Duration**: 2 weeks

---

## 1. Authentication System

### 1.1 Better-Auth Configuration

Better-Auth is configured for **username + password only**. No OAuth providers, no magic links, no passwordless flows.

**Module**: `src/lib/auth.ts`

```
Configuration:
  - Provider: credentials (username + password)
  - Session storage: Redis (not database-backed)
  - Cookie: HTTP-only, Secure, SameSite=Lax
  - Password hashing: argon2id (via Better-Auth defaults)
```

**Key Decisions**:
- Better-Auth's built-in session adapter is overridden with a custom Redis adapter
- The session token is an opaque string stored as cookie value
- Session payload contains: `{ userId, username, role, sessionId, createdAt }`

---

### 1.2 Redis Session Management

**Module**: `src/lib/session.ts`

| Parameter | Value | Rationale |
|---|---|---|
| Session TTL | 24 hours | Balance security with UX |
| Sliding window | Refresh on activity within last 50% of TTL | Prevents unnecessary writes |
| Key pattern | `session:{sessionId}` | Simple, scannable namespace |
| Storage format | JSON-serialized session payload | Fast read/write |

**Lifecycle**:
1. On login → generate `sessionId` (crypto.randomUUID), write to Redis with TTL, set HTTP-only cookie
2. On authenticated request → read session from Redis by cookie value
3. If session exists and within sliding window → refresh TTL
4. If session expired → cookie is cleared, 401 returned, client redirects to login
5. On logout → delete Redis key, clear cookie

**Implementation Notes**:
- Never query PostgreSQL for session validation — Redis is the sole authority
- Session refresh is conditional (only if >50% of TTL elapsed) to avoid write-amplification on every request
- All session operations go through `src/lib/session.ts` — no direct Redis calls in route handlers

---

### 1.3 Rate Limiting

**Module**: `src/middleware/rate-limit.ts`

Rate limiting on the login endpoint uses a **sliding window counter** in Redis.

| Parameter | Value |
|---|---|
| Key pattern | `ratelimit:login:{ip}:{username}` |
| Max attempts | 5 per 15-minute window |
| Lockout duration | 30 minutes after threshold exceeded |
| Behavior on lockout | Artificial delay (2–5 seconds) before rejection |

**Why artificial delay instead of instant rejection?**
Instant rejection leaks timing information — an attacker can distinguish between "account doesn't exist" and "account locked out" based on response time. The artificial delay normalizes response timing.

**Middleware integration**:
```
Request → Rate Limit Check (Redis) → Pass/Reject → Auth Handler
```

Rate limiting also applies to other endpoints (configurable per-category):

| Category | Limit |
|---|---|
| Login | 5 req / 15 min per IP+username |
| Upload | 30 req / min per user |
| Read | 200 req / min per user |
| Search | 60 req / min per user |
| Admin operations | 20 req / min per user |

---

## 2. RBAC System

### 2.1 Role Definitions

**Module**: `src/lib/rbac/roles.ts`

Four system-level roles with hierarchical capability:

```
superadmin > admin > viewer > guest
```

| Role | System Capabilities |
|---|---|
| **superadmin** | Full unrestricted access. Manage users, files, config. Override read-only. Recover soft-deleted files. Query audit log. |
| **admin** | Manage users within scope. Manage files within scope. Cannot alter system config. |
| **viewer** | Read-only access to files they have permission for. Download. Search. |
| **guest** | Unauthenticated. Can only access files marked public + guest-accessible. |

### 2.2 File-Level Permissions

**Module**: `src/lib/rbac/permissions.ts`

File-level permissions allow granular access control per file:

| Concept | Detail |
|---|---|
| Owner | The user who uploaded the file. Has full control. |
| Explicit grant | Owner (or admin) can grant a specific user a role on a specific file |
| Override direction | File-level can elevate a viewer to admin **on that file**, but cannot elevate a guest beyond viewer |
| Storage | `file_permissions` table: `(file_id, user_id, granted_role, granted_by, granted_at)` |

### 2.3 Permission Resolution Algorithm

**Module**: `src/lib/rbac/resolve.ts`

Permission resolution executes in strict order:

```
1. Is user superadmin?
   → YES: Grant full access, skip all further checks

2. Does user have an explicit file-level grant?
   → YES: Use the granted role for this file

3. Is the file public?
   → YES + user is authenticated: Grant viewer access
   → YES + file allows guest access + user is guest: Grant viewer access

4. Is the file's owner the requesting user?
   → YES: Grant owner (full) access

5. DENY — no matching rule
```

After RBAC resolution, additional restrictions are applied:

```
6. Is the file mention-restricted?
   → YES: Check if user is in mention list
   → NOT in list: DENY (even if RBAC granted access)

7. Is the file read-only?
   → YES + operation is mutation: DENY (unless superadmin)
```

**Caching**: Resolved permission decisions are cached in Redis:
- Key: `perm:{userId}:{fileId}`
- TTL: 5 minutes
- Invalidation triggers: file permission change, user role change, file config change

---

## 3. Database Schema (Phase 1)

### Users Table

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('superadmin', 'admin', 'viewer')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### File Permissions Table

```sql
CREATE TABLE file_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id     UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_role VARCHAR(20) NOT NULL
               CHECK (granted_role IN ('admin', 'viewer')),
  granted_by  UUID NOT NULL REFERENCES users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (file_id, user_id)
);
```

> [!NOTE]
> The `files` table is defined in [02-plan-storage-and-lifecycle.md](file:///c:/Project/anticloud/plans/02-plan-storage-and-lifecycle.md). The foreign key reference here is forward-looking.

---

## 4. File Structure (Phase 1)

```
src/
├── app/
│   ├── api/
│   │   └── auth/
│   │       └── [...betterauth]/
│   │           └── route.ts          # Better-Auth catch-all handler
│   ├── login/
│   │   └── page.tsx                  # Login page
│   └── layout.tsx
├── lib/
│   ├── auth.ts                       # Better-Auth configuration
│   ├── session.ts                    # Redis session management
│   ├── redis.ts                      # Redis client singleton
│   ├── db.ts                         # Drizzle ORM client
│   └── rbac/
│       ├── roles.ts                  # Role definitions and capability maps
│       ├── permissions.ts            # File-level permission logic
│       └── resolve.ts               # Permission resolution algorithm
├── middleware/
│   ├── auth.ts                       # Session validation middleware
│   └── rate-limit.ts                 # Rate limiting middleware
├── db/
│   └── schema/
│       ├── users.ts                  # Drizzle schema for users
│       └── file-permissions.ts       # Drizzle schema for file_permissions
└── middleware.ts                     # Next.js edge middleware entry point
```

---

## 5. API Contracts (Phase 1)

### POST `/api/auth/login`
```
Request:  { username: string, password: string }
Response: { success: true, user: { id, username, role } }
Error:    { success: false, error: "Invalid credentials" }
Headers:  Set-Cookie: session=<token>; HttpOnly; Secure; SameSite=Lax
Rate:     5 req / 15 min per IP+username
```

### POST `/api/auth/logout`
```
Request:  (no body, session cookie required)
Response: { success: true }
Headers:  Set-Cookie: session=; Max-Age=0
```

### GET `/api/auth/me`
```
Request:  (session cookie required)
Response: { id, username, role, createdAt }
Error:    401 if no valid session
```

---

## 6. Verification Plan

### Automated Tests
- **Unit**: Permission resolution algorithm with all edge cases (superadmin bypass, file-level override, mention restriction, guest elevation cap)
- **Integration**: Login flow → session creation in Redis → authenticated request → session refresh → logout → session deletion
- **Rate limiting**: Exceed threshold → verify lockout → verify artificial delay timing

### Manual Verification
- Verify HTTP-only cookie is set correctly in browser DevTools
- Verify Redis session keys are created/refreshed/deleted at expected times
- Verify rate-limited login returns consistent response times (no timing leak)
