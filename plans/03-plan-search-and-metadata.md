# Plan 03 — Search & Metadata Intelligence

> **Phase**: 3 (File Intelligence)
> **Dependencies**: Phase 2 (Files + Storage)
> **Estimated Duration**: 2 weeks

---

## 1. File Tagging System

### 1.1 Data Model

**Normalized tag storage** — avoids duplication and enables efficient querying.

```sql
CREATE TABLE tags (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE file_tags (
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  tag_id  UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  tagged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  tagged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (file_id, tag_id)
);
```

### 1.2 Tag Autocomplete

**Redis sorted set** tracks tag usage frequency for fast prefix-based autocomplete.

- Key: `tags:frequency`
- On tag applied: `ZINCRBY tags:frequency 1 "tag-name"`
- Autocomplete query: `ZRANGEBYLEX` for prefix match, sorted by score (frequency)
- Fallback: If tag not in Redis, query PostgreSQL `tags` table by `LIKE 'prefix%'`

### 1.3 Tag API

| Endpoint | Method | Description |
|---|---|---|
| `POST /api/files/:fileId/tags` | POST | `{ tags: string[] }` — add tags |
| `DELETE /api/files/:fileId/tags/:tagName` | DELETE | Remove tag from file |
| `GET /api/tags/autocomplete?q=prefix` | GET | Top 10 matching tags |
| `GET /api/files?tag=name` | GET | Files filtered by tag |

---

## 2. User Mentions

### 2.1 Data Model

```sql
CREATE TABLE file_mentions (
  file_id      UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentioned_by UUID NOT NULL REFERENCES users(id),
  mentioned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (file_id, mentioned_user_id)
);
```

### 2.2 Mention Behavior

- **Adding a mention** → creates `file_mentions` record + creates notification for mentioned user
- **Mention-restricted files** → only users in mention list can access (checked after RBAC, see Plan 01)
- **Removing a mention** → if file is mention-restricted, immediately revokes that user's access
- **Who can mention**: file owner + admins

### 2.3 Notifications

```sql
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(50) NOT NULL,    -- 'file_mention', 'permission_granted', etc.
  payload    JSONB NOT NULL,          -- { fileId, fileName, mentionedBy, ... }
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
```

### 2.4 Mention API

| Endpoint | Method | Description |
|---|---|---|
| `POST /api/files/:fileId/mentions` | POST | `{ userIds: string[] }` |
| `DELETE /api/files/:fileId/mentions/:userId` | DELETE | Remove mention |
| `GET /api/notifications` | GET | User's notifications (paginated) |
| `PATCH /api/notifications/:id/read` | PATCH | Mark as read |

---

## 3. File Notes

### 3.1 Data Model (Versioned)

```sql
CREATE TABLE file_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id    UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  content    TEXT NOT NULL,
  author_id  UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (file_id, version)
);

CREATE INDEX idx_file_notes_latest ON file_notes(file_id, version DESC);
```

### 3.2 Note Behavior

- **Read**: Return latest version (highest `version` number)
- **Edit**: Insert new version record (never overwrite), increment version
- **History**: Admins + owner can see all versions
- **Redis cache**: Current note cached at `note:{fileId}`, invalidated on any write
- **Search**: Note content included in full-text search index

### 3.3 Notes API

| Endpoint | Method | Description |
|---|---|---|
| `GET /api/files/:fileId/notes` | GET | Current note (latest version) |
| `POST /api/files/:fileId/notes` | POST | `{ content: string }` — new version |
| `GET /api/files/:fileId/notes/history` | GET | All versions (admin/owner) |

---

## 4. Full-Text Search

### 4.1 Search Index

PostgreSQL `tsvector` index covers:
- File name (`files.name`)
- Tag names (via join to `tags`)
- Note content (`file_notes.content`, latest version)
- Mentioned usernames (via join to `users` through `file_mentions`)

**Implementation**: A materialized or computed `tsvector` column on a search-oriented view, or use `ts_rank` with dynamic query construction.

```sql
-- Search view (conceptual)
CREATE MATERIALIZED VIEW file_search_index AS
SELECT
  f.id AS file_id,
  setweight(to_tsvector('english', f.name), 'A') ||
  setweight(to_tsvector('english', COALESCE(string_agg(DISTINCT t.name, ' '), '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(fn.content, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(string_agg(DISTINCT u.username, ' '), '')), 'D')
  AS search_vector
FROM files f
LEFT JOIN file_tags ft ON f.id = ft.file_id
LEFT JOIN tags t ON ft.tag_id = t.id
LEFT JOIN LATERAL (
  SELECT content FROM file_notes
  WHERE file_id = f.id ORDER BY version DESC LIMIT 1
) fn ON true
LEFT JOIN file_mentions fm ON f.id = fm.file_id
LEFT JOIN users u ON fm.mentioned_user_id = u.id
WHERE f.is_deleted = false
GROUP BY f.id, fn.content;

CREATE INDEX idx_search_vector ON file_search_index USING GIN(search_vector);
```

### 4.2 Search Query

```
GET /api/files/search?q=term&tag=name&dateFrom=...&dateTo=...&uploader=userId&type=pdf&visibility=public
```

- Query tokenized with `plainto_tsquery` or `websearch_to_tsquery`
- Results ranked by `ts_rank`
- **Always scoped** to user's permission — joined with permission resolution
- Advanced filters composed into single SQL query (no post-filtering in memory)

### 4.3 Search Cache (Redis)

- Key: `search:{userId}:{queryHash}`
- TTL: 60 seconds
- Invalidation: triggered on user's file upload, tag change, or delete

---

## 5. Date-Grouped File Listing

### 5.1 Server-Side Grouping

Files grouped by upload date using PostgreSQL date truncation:

```sql
SELECT
  CASE
    WHEN created_at::date = CURRENT_DATE THEN 'Today'
    WHEN created_at::date = CURRENT_DATE - 1 THEN 'Yesterday'
    WHEN created_at >= date_trunc('week', CURRENT_DATE) THEN 'This Week'
    WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN 'This Month'
    ELSE to_char(created_at, 'YYYY-MM')
  END AS date_group,
  ...
FROM files
WHERE ...
ORDER BY created_at DESC;
```

- Grouping computed in query, not application memory
- Response shape: `{ groups: [{ label: "Today", files: [...] }, ...] }`
- Client renders pre-grouped data without additional computation

### 5.2 API

```
GET /api/files/grouped?page=1&limit=50
```

---

## 6. File Structure (Phase 3)

```
src/
├── app/api/
│   ├── files/
│   │   ├── search/route.ts
│   │   ├── grouped/route.ts
│   │   └── [fileId]/
│   │       ├── tags/route.ts
│   │       ├── mentions/route.ts
│   │       └── notes/
│   │           ├── route.ts
│   │           └── history/route.ts
│   ├── tags/
│   │   └── autocomplete/route.ts
│   └── notifications/
│       ├── route.ts
│       └── [id]/read/route.ts
├── lib/
│   ├── search.ts
│   └── tags.ts
└── db/schema/
    ├── tags.ts
    ├── file-tags.ts
    ├── file-mentions.ts
    ├── file-notes.ts
    └── notifications.ts
```

---

## 7. Verification Plan

- **Tags**: Add tags → autocomplete returns them → filter files by tag
- **Mentions**: Mention user → notification created → mention-restricted file blocks non-mentioned users
- **Notes**: Create note → edit (new version) → verify history → search by note content
- **Search**: Upload files with tags/notes → search finds them → permission-scoped (no leaks)
- **Date grouping**: Upload files across different dates → verify correct bucketing
- **Cache**: Search → cached → mutate → re-search → fresh results
