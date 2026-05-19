# Plan 05 — Caching, Audit & Observability

> **Phase**: 5 (Hardening & Observability)
> **Dependencies**: All previous phases
> **Estimated Duration**: 2 weeks

---

## 1. Redis Caching Strategy

### 1.1 Namespace Design

Each cache concern occupies its own Redis key namespace with independent TTL policies.

| Namespace | Key Pattern | TTL | Invalidation Trigger |
|---|---|---|---|
| **Session** | `session:{sessionId}` | 24h (sliding) | Logout, expiry |
| **Permission** | `perm:{userId}:{fileId}` | 5 min | File permission change, user role change, file config change |
| **File metadata** | `file:{fileId}` | 10 min | Any write to file's metadata |
| **Search results** | `search:{userId}:{queryHash}` | 60 sec | User uploads, tags, or deletes a file |
| **Tag frequency** | `tags:frequency` (sorted set) | Persistent | Incremented on tag use |
| **Note content** | `note:{fileId}` | 10 min | Any note write |
| **Job status** | `job:status:{jobId}` | 1 hour | Job completion or failure |
| **Rate limit** | `ratelimit:{category}:{key}` | Per-window (15 min login, 1 min others) | Auto-expire |

### 1.2 Cache Invalidation Strategy

**Targeted invalidation** — never flush entire namespaces.

| Event | Keys Invalidated |
|---|---|
| File permission changed | `perm:*:{fileId}` (scan + delete) |
| User role changed | `perm:{userId}:*` (scan + delete) |
| File metadata updated | `file:{fileId}` |
| File visibility changed | `perm:*:{fileId}` + `file:{fileId}` |
| File config changed | `perm:*:{fileId}` + `file:{fileId}` |
| Note edited | `note:{fileId}` |
| File uploaded/deleted/tagged | `search:{userId}:*` for the acting user |

> [!WARNING]
> **Wildcard scan invalidation** (`perm:*:{fileId}`) should use Redis `SCAN` with pattern match — never `KEYS` in production (blocking). For high-traffic scenarios, consider maintaining a reverse index set `perm-files:{fileId}` → `[userId1, userId2, ...]` for O(n) targeted deletion.

### 1.3 Cache Module

**File**: `src/lib/cache.ts`

Provides typed cache operations per namespace:

```typescript
// Conceptual API
const cache = {
  permission: {
    get(userId, fileId): Promise<ResolvedPermission | null>,
    set(userId, fileId, perm: ResolvedPermission): Promise<void>,
    invalidateForFile(fileId): Promise<void>,
    invalidateForUser(userId): Promise<void>,
  },
  fileMetadata: {
    get(fileId): Promise<FileRecord | null>,
    set(fileId, data: FileRecord): Promise<void>,
    invalidate(fileId): Promise<void>,
  },
  // ... similar for other namespaces
};
```

---

## 2. Audit Logging

### 2.1 Audit Log Table

```sql
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_ip    INET,
  action      VARCHAR(50) NOT NULL,
  target_type VARCHAR(20) NOT NULL,    -- 'file', 'user', 'config'
  target_id   UUID,
  details     JSONB,                   -- action-specific context
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only: NO UPDATE or DELETE permissions granted to app role
-- Indexes for query patterns:
CREATE INDEX idx_audit_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_target ON audit_logs(target_type, target_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_time ON audit_logs(created_at DESC);
```

### 2.2 Audited Actions

| Action | Target Type | Details |
|---|---|---|
| `file.upload` | file | `{ name, size, mimeType }` |
| `file.download` | file | `{ name }` |
| `file.rename` | file | `{ oldName, newName }` |
| `file.delete` | file | `{ name, soft: true }` |
| `file.hard_delete` | file | `{ name }` |
| `file.recover` | file | `{ name }` |
| `file.visibility_change` | file | `{ oldVisibility, newVisibility }` |
| `file.config_change` | file | `{ changes: {...} }` |
| `file.compress` | file | `{ jobId }` |
| `permission.grant` | file | `{ grantedTo, role }` |
| `permission.revoke` | file | `{ revokedFrom }` |
| `user.create` | user | `{ username, role }` |
| `user.role_change` | user | `{ oldRole, newRole }` |
| `user.delete` | user | `{ username }` |
| `auth.login` | user | `{ success: bool }` |
| `auth.logout` | user | `{}` |

### 2.3 Audit Service

**File**: `src/lib/audit.ts`

```typescript
async function logAudit(params: {
  actorId: string | null;
  actorIp: string;
  action: AuditAction;
  targetType: 'file' | 'user' | 'config';
  targetId: string;
  details?: Record<string, unknown>;
}): Promise<void>
```

- **Fire-and-forget**: Audit writes are non-blocking (use `Promise` without `await` in hot paths, or batch-insert via queue)
- **Append-only enforcement**: Database role used by the application has `INSERT` only on `audit_logs` — no `UPDATE`, no `DELETE`
- **Cannot be bypassed**: Audit logging is integrated into core service functions, not middleware (prevents handler-level bypass)

### 2.4 Audit Query API (Superadmin Only)

```
GET /api/admin/audit?actor=userId&target=fileId&action=file.upload&from=2026-01-01&to=2026-05-19&page=1&limit=50

Response: {
  logs: AuditEntry[],
  pagination: { page, limit, total }
}
```

Auth: superadmin only.

---

## 3. API Middleware Pipeline

### 3.1 Middleware Execution Order

Every request passes through middleware in strict order:

```
1. Session Resolution    → Read cookie, look up Redis session, attach user to context
2. Rate Limiting         → Check Redis counter for user/IP + endpoint category
3. Permission Check      → For file endpoints: resolve permission via RBAC engine
4. Route Handler         → Business logic (trusts middleware has validated everything)
```

### 3.2 Implementation

**File**: `src/middleware.ts` (Next.js edge middleware)

Handles steps 1-2 at the edge:
- Session resolution from cookie
- Rate limit check via Redis
- Attaches `x-user-id` and `x-user-role` headers to internal request

**File**: `src/middleware/permission.ts` (Route-level middleware)

Handles step 3 inside route handlers:
- Wraps route handlers with permission check
- Uses `withPermission(handler, { requiredRole, fileParam })` HOF pattern

```typescript
// Usage in route handler
export const GET = withPermission(
  async (req, { user, file, permission }) => {
    // Handler trusts permission is already validated
    return NextResponse.json(file);
  },
  { requiredRole: 'viewer', fileParam: 'fileId' }
);
```

### 3.3 Error Responses

All middleware rejections return consistent JSON:

```json
{
  "error": {
    "code": "UNAUTHORIZED | FORBIDDEN | RATE_LIMITED | NOT_FOUND",
    "message": "Human-readable message",
    "retryAfter": 30  // only for RATE_LIMITED
  }
}
```

---

## 4. Prometheus Metrics

### 4.1 Metrics Endpoint

**File**: `src/app/api/metrics/route.ts`

```
GET /api/metrics
Content-Type: text/plain; version=0.0.4

Auth: Internal only (protected by secret header or IP allowlist)
```

### 4.2 Exposed Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `anticloud_http_requests_total` | Counter | `method, path, status` | Total HTTP requests |
| `anticloud_http_request_duration_seconds` | Histogram | `method, path` | Request latency |
| `anticloud_file_uploads_total` | Counter | `mime_type` | Files uploaded |
| `anticloud_file_downloads_total` | Counter | — | Files downloaded |
| `anticloud_storage_bytes_total` | Gauge | — | Total bytes stored in MinIO |
| `anticloud_active_sessions` | Gauge | — | Current active sessions in Redis |
| `anticloud_cache_hits_total` | Counter | `namespace` | Cache hits per namespace |
| `anticloud_cache_misses_total` | Counter | `namespace` | Cache misses per namespace |
| `anticloud_job_queue_depth` | Gauge | `queue` | Current pending jobs |
| `anticloud_jobs_completed_total` | Counter | `type, status` | Completed jobs by type |
| `anticloud_rate_limit_rejections_total` | Counter | `category` | Rate limit rejections |
| `anticloud_errors_total` | Counter | `type` | Application errors |

### 4.3 Metrics Collection

**File**: `src/lib/metrics.ts`

Uses `prom-client` library:
- Default Node.js metrics (memory, CPU, event loop)
- Custom application metrics defined above
- Collected via middleware wrappers and service-level instrumentation

---

## 5. File Structure (Phase 5)

```
src/
├── app/api/
│   ├── admin/
│   │   └── audit/route.ts            # Audit log query (superadmin)
│   └── metrics/route.ts              # Prometheus metrics
├── lib/
│   ├── cache.ts                      # Typed cache operations per namespace
│   ├── audit.ts                      # Audit logging service
│   └── metrics.ts                    # Prometheus metrics registry
├── middleware/
│   └── permission.ts                 # Route-level permission HOF
└── middleware.ts                     # Next.js edge middleware (session + rate limit)
```

---

## 6. Docker Compose (Complete)

Final Docker Compose includes all services:

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    depends_on: [postgres, redis, minio]
    environment: &app-env
      DATABASE_URL: postgresql://...
      REDIS_URL: redis://redis:6379
      MINIO_ENDPOINT: minio:9000
      # ... all env vars

  worker:
    build: .
    command: node dist/worker.js
    depends_on: [postgres, redis, minio]
    environment: *app-env

  postgres:
    image: postgres:16-alpine
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    volumes: [redisdata:/data]

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    volumes: [miniodata:/data]

  prometheus:
    image: prom/prometheus
    volumes: [./prometheus.yml:/etc/prometheus/prometheus.yml]

volumes:
  pgdata:
  redisdata:
  miniodata:
```

---

## 7. Verification Plan

### Caching
- Permission cache: grant access → verify cached → revoke → verify cache invalidated → re-check returns 403
- Search cache: search → verify cached → upload file → re-search → verify fresh results
- Metrics: verify cache hit/miss counters increment correctly

### Audit
- Perform file operations → query audit log → verify all actions recorded
- Verify audit log is append-only (attempt UPDATE/DELETE → rejected at DB level)
- Verify superadmin-only access to audit endpoint

### Middleware
- Unauthenticated request to protected endpoint → 401
- Authenticated request without file access → 403
- Exceed rate limit → verify 429 with `retryAfter`
- Verify middleware order (session → rate limit → permission → handler)

### Metrics
- Hit `/api/metrics` → verify Prometheus text format
- Perform operations → verify counters/gauges update
- Verify Prometheus can scrape the endpoint

### Integration
- Full flow: login → upload → tag → search → download → compress → bulk download → audit trail
