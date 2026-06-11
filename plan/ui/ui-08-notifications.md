# UI-08 — Notifications

**Goal:** Header bell with live unread badge + a dropdown of recent notifications, and a full `/notifications` page. Bound to `actions/notifications.ts`.

**Depends on:** ui-00, Phase 6. **Unlocks:** —

## Steps (agent actions)

### 08.1 — Unread badge
- Bind the header bell (ui-00) to `getUnreadCount()`. Show a `ui/badge` count; poll or refresh on focus/navigation. Hide badge at zero.
- **Accept:** mentioning the user elsewhere increments the badge after refresh.

### 08.2 — Notifications popover
- `components/notifications-popover.tsx` (`ui/popover` + `ui/scroll-area`): `getNotifications({ limit })` → list (message, related file link, relative time, read/unread style). Click an item → `markAsRead` + navigate to the file. "Mark all read" → `markAllRead`.
- **Accept:** items render newest-first; clicking marks read and routes; mark-all clears the badge.

### 08.3 — Notifications page (RSC)
- `app/(app)/notifications/page.tsx`: paginated full history via `getNotifications` (read/unread tabs with `ui/tabs`). Empty + loading states.
- **Accept:** full list paginates; tabs filter read/unread.

## Components used
`ui/popover`, `ui/scroll-area`, `ui/badge`, `ui/tabs`, `ui/button`, `ui/empty`, `ui/skeleton`, `ui/sonner`; `lib/format.ts`.

## Out of scope
Real-time push (no WS/SSE backend) — refresh/poll only.
