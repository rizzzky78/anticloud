# Phase 21 — Notifications v2

**Goal:** Notifications arrive instantly and cover the collaboration events people care about.

**Depends on:** Phase 14. **Unlocks:** —

## Steps (agent actions)

### 21.1 — Notify helper
- `lib/notify.ts`: `notify(userIds, { type, message, fileId })` persists rows (deduplicated, capped) and publishes to `notify:<userId>`; `notifyFileOwner()` skips self-actions and unowned files. Types: `MENTION`, `SHARE`, `GROUP`, `FILE_UPDATE`, `NOTE`, `JOB`.
- All existing writers (file/group/folder shares, group membership, mentions) use it; self-mentions no longer notify.

### 21.2 — Real-time stream
- `lib/realtime.ts`: one pattern subscriber per server process fans messages out to registered listeners (constant Redis connections).
- `GET /api/notifications/stream`: authenticated SSE (`ready`, `notification` events, 25 s heartbeat, retry hint, cleanup on abort).
- Notification popover uses `EventSource` (badge increments, toast, list refresh when open; re-sync on reconnect) with a 2-minute safety poll (15 s if EventSource is unavailable).
- **Accept:** sharing a file with an online user updates their bell within a second.

### 21.3 — New events
- Collaborator uploads a new version or restores a version → owner (`FILE_UPDATE`); collaborator edits a note → owner (`NOTE`); bulk ZIP ready → requester (`JOB`).
- **Accept:** an editor's upload notifies the file owner.

## Deliverables
`lib/notify.ts`, `lib/realtime.ts`, SSE route, live popover, new notification events.
