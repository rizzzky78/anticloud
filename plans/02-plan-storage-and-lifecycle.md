# Plan 02 — File Storage & Lifecycle

> **Phase**: 2 (File Storage Core)
> **Dependencies**: Phase 1 (Auth + RBAC)
> **Estimated Duration**: 2 weeks

---

## 1. MinIO Storage Architecture

### 1.1 Storage Service Module

**Module**: `src/lib/storage/minio.ts`

All MinIO interactions are encapsulated behind a **storage service abstraction**. No route handler or server action ever constructs MinIO paths or calls the MinIO SDK directly.

**Public API surface** (conceptual):

- `upload(stream, contentType, size)` → `StorageRef`
- `download(ref)` → `ReadableStream`
- `delete(ref)` → `void`
- `generatePresignedUrl(ref, ttl?)` → `string`
- `exists(ref)` → `boolean`

**Key Design Decisions**:

| Decision | Rationale |
|---|---|
| Object keys are UUID-based | No relationship to user-visible filenames — prevents path traversal |
| Flat namespace with prefix | `uploads/{YYYY}/{MM}/{uuid}` — aids operational browsing |
| No disk writes on app server | Streams flow directly: client → Route Handler → MinIO |
| Single bucket for files | Simplicity; access control is application-layer |
| Separate temp bucket for archives | Bulk download archives stored temporarily, auto-cleaned |

### 1.2 MinIO Config

```
MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY
MINIO_BUCKET_FILES=anticloud-files
MINIO_BUCKET_TEMP=anticloud-temp
```

---

## 2. File Upload Pipeline

### 2.1 Upload Flow

```
Client → POST /api/files/upload (multipart) → Auth Middleware → Storage Service → MinIO (streaming PutObject) → DB INSERT → Response
```

**File**: `src/app/api/files/upload/route.ts`

**Request**: multipart/form-data with `file` (binary), `name` (optional), `visibility` (optional), `tags` (optional)

**Response**: `{ id, name, size, mimeType, visibility, createdAt }`

**Limits**: Max 500MB, 30 req/min per user

**Implementation Notes**:
- Use `Request.formData()` to access the uploaded `Blob`
- Convert to `ReadableStream` for streaming — never buffer entire file
- If MinIO upload fails, no DB record created
- If DB insert fails after MinIO upload, schedule cleanup job

---

## 3. File Download

**File**: `src/app/api/files/[fileId]/download/route.ts`

```
GET /api/files/:fileId/download
```

- Permission resolved first, then stream from MinIO
- `Content-Disposition` uses user-visible filename from PostgreSQL
- Streamed response, never buffered
- Auth required unless public + guest-accessible

---

## 4. Database Schema

### Files Table

```sql
CREATE TABLE files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_ref   TEXT NOT NULL,
  name          VARCHAR(1024) NOT NULL,
  original_name VARCHAR(1024) NOT NULL,
  mime_type     VARCHAR(255) NOT NULL,
  size_bytes    BIGINT NOT NULL,
  visibility    VARCHAR(10) NOT NULL DEFAULT 'private'
                CHECK (visibility IN ('public', 'private')),
  owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  is_deleted    BOOLEAN NOT NULL DEFAULT false,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- `owner_id` nullable → allows unowned files (orphaned after user deletion)
- `ON DELETE SET NULL` → user deletion converts files to unowned
- Indexes on `owner_id`, `visibility`, `created_at DESC` (filtered by `NOT is_deleted`)

### File Configs Table

```sql
CREATE TABLE file_configs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id               UUID NOT NULL UNIQUE REFERENCES files(id) ON DELETE CASCADE,
  ttl_expires_at        TIMESTAMPTZ,
  is_read_only          BOOLEAN NOT NULL DEFAULT false,
  is_mention_restricted BOOLEAN NOT NULL DEFAULT false,
  presigned_url         TEXT,
  presigned_url_token   VARCHAR(255),
  allow_guest_access    BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 5. File Operations API

| Endpoint | Method | Body | Notes |
|---|---|---|---|
| `/api/files/:fileId` | GET | — | File metadata |
| `/api/files/:fileId` | PATCH | `{ name?, visibility? }` | Rename/visibility (DB only, no MinIO) |
| `/api/files/:fileId` | DELETE | — | Soft delete (`is_deleted = true`) |
| `/api/files/:fileId/config` | PATCH | `{ ttlExpiresAt?, isReadOnly?, ... }` | Update file config |
| `/api/files/:fileId/recover` | POST | — | Superadmin only, during grace period |
| `/api/files?page&limit&sort` | GET | — | Paginated, permission-filtered list |

---

## 6. Presigned URL System

**Generation**: Owner requests → random token generated → MinIO `presignedGetObject()` with long TTL → token + URL stored in `file_configs`

**Access**: `GET /api/files/presigned/:token` → look up token → validate file exists + not deleted → run permission resolution → if valid, proxy download

**Key**: The URL is a *token*, not a *capability*. Revoking access or changing visibility invalidates usefulness.

---

## 7. Visibility Rules

| File State | Authenticated User | Guest |
|---|---|---|
| Private, no grant | ❌ | ❌ |
| Private, explicit grant | ✅ per role | ❌ |
| Private, owner | ✅ full | ❌ |
| Public | ✅ viewer | ❌ |
| Public + guest-allowed | ✅ viewer | ✅ viewer |

**Unowned files**: Private unowned → admin/superadmin only. Public unowned → same as public owned.

---

## 8. File Structure (Phase 2)

```
src/
├── app/api/files/
│   ├── upload/route.ts
│   ├── [fileId]/
│   │   ├── route.ts              # GET, PATCH, DELETE
│   │   ├── download/route.ts
│   │   ├── config/route.ts
│   │   └── recover/route.ts
│   └── presigned/[token]/route.ts
├── lib/storage/
│   ├── minio.ts                  # StorageService
│   └── types.ts
└── db/schema/
    ├── files.ts
    └── file-configs.ts
```

---

## 9. Verification Plan

- **Upload**: Stream file → verify MinIO object + DB record
- **Download**: Upload → download → compare checksums
- **Permission**: Upload as A → download as B (no grant) → 403
- **Soft delete**: Delete → verify flag → verify MinIO untouched
- **Presigned**: Generate → access → revoke visibility → re-access → 403
- **Unowned**: Delete user → verify files become unowned
- **Streaming**: Upload >100MB → verify memory stays flat
