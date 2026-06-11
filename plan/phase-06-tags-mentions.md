# Phase 6 — Tags & Mentions

**Goal:** Normalized free-form tags with Redis-backed prefix autocomplete, and user mentions that both notify and (when mention-restricted) grant access.

**Depends on:** Phase 4 (Phase 5 for the restriction gate). **Unlocks:** search (8).

## Steps (agent actions)

### 6.1 — Tag schema
- Add `Tag` (unique value) + `FileTag` junction (fileId, tagId) to `prisma/schema.prisma`. Migrate.
- **Accept:** a file can carry multiple tags; querying files-by-tag and tags-by-file is indexed.

### 6.2 — Tag write + frequency cache
- `actions/tags.ts`: add/remove tags on a file (permission-gated, respects read-only). On apply, increment the tag's score in a Redis sorted set (`tagfreq:` namespace).
- Bust the owner's search cache (Phase 8 contract) on tag change.
- **Accept:** applying a tag upserts the relation and bumps the Redis frequency score.

### 6.3 — Tag autocomplete
- `app/api/tags/autocomplete/route.ts` — query the Redis sorted set for top tags by prefix; fall back to Postgres for tags not yet cached.
- **Accept:** typing a prefix returns frequency-ranked suggestions; uncached tags still appear via DB fallback.

### 6.4 — Mention schema
- Add `FileMention` (fileId, mentionedUserId, addedBy, createdAt) — this is the relation the Phase 5 restriction gate reads. Migrate.
- **Accept:** mentions persist per file; the restriction gate now reads real data.

### 6.5 — Mention write + notification
- `actions/mentions.ts`: add/remove mentions (owner/admin only). On add: create an in-app `Notification` row (add `Notification` model) for the mentioned user. If the file is mention-restricted, the mention **grants access** via the gate.
- Bust `perm:` cache for affected user-file pairs.
- **Accept:** mentioning a user creates a notification and (when restricted) grants them access; un-mentioning revokes it.

### 6.6 — Notification read surface
- Minimal `actions/notifications.ts` + listing: fetch unread/read notifications for the current user, mark-as-read. Use existing shadcn components.
- **Accept:** mentioned user sees the notification and can mark it read.

## Deliverables
`Tag`/`FileTag`/`FileMention`/`Notification` models + migrations, `actions/tags.ts`, `actions/mentions.ts`, `actions/notifications.ts`, tag autocomplete route.

## Out of scope
Including tags/mentions in the search index (Phase 8 owns indexing).
