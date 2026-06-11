# Anticloud — UI Implementation Plan (Index)

Frontend plan for the file platform. Every screen binds to an **already-implemented** handler (server action, route handler, or `lib/` data function). UI is built **only** from existing `components/ui/*` (shadcn) + the scaffold feature components — **never modify `components/ui/*`** and reuse the current color scheme.

> Backend contracts are real (Phases 0–7 done; 8 partially). Where a surface needs a not-yet-built handler (bulk download, compression, audit, metrics — Phases 9–10), the step is marked **⛔ blocked** and lists its unblocking backend step.

## Route Map

| Route | Screen | UI phase |
|-------|--------|----------|
| `/(auth)/sign-in`, `/sign-up` | Auth | [ui-01](ui-01-auth.md) |
| `/(app)` layout | Authenticated shell (sidebar + header) | [ui-00](ui-00-shell.md) |
| `/(app)/files` | File browser (date-grouped) | [ui-02](ui-02-file-browser.md) |
| `/(app)/files/[id]` | File detail + lifecycle config | [ui-04](ui-04-file-detail.md) |
| upload dialog (global) | Upload / replace | [ui-03](ui-03-upload.md) |
| detail side-panels | Tags · mentions · notes | [ui-05](ui-05-collaboration.md) |
| share dialog | File-level grants | [ui-06](ui-06-sharing.md) |
| `/(app)/search` + ⌘K | Search & filters | [ui-07](ui-07-search.md) |
| header popover + `/(app)/notifications` | Notifications | [ui-08](ui-08-notifications.md) |
| `/(app)/admin/*` | Roles · recycle bin · jobs/DLQ · (audit/metrics ⛔) | [ui-09](ui-09-admin.md) |
| `/(app)/settings` | Account, theme, sign-out | [ui-10](ui-10-settings.md) |
| selection toolbar | Bulk download / compression | [ui-11](ui-11-bulk.md) |

## Handler Binding (UI → backend)

| UI surface | Handler | Source |
|------------|---------|--------|
| Sign in / up / out / session | `signIn`, `signUp`, `signOut`, `useSession` | `lib/auth-client.ts` |
| List files (grouped) | `listFilesGrouped()` → `FileBucket[]` | `lib/file-list.ts` (or `GET /api/files`) |
| File metadata | `getFileMeta(id)` → `FileMetaRecord` | `lib/file-meta.ts` |
| Upload | `POST /api/files/upload` (FormData) | `app/api/files/upload` |
| Download / preview | `GET /api/files/[id]` | `app/api/files/[id]` |
| Replace binary | `PUT /api/files/[id]/replace` | `app/api/files/[id]/replace` |
| Public link | `GET /api/files/p/[token]` | `app/api/files/p/[token]` |
| Rename / move / visibility | `renameFile`, `moveFile`, `setVisibility` | `actions/files.ts` |
| TTL / soft-delete / recover / presigned / read-only / mention-restrict | `setTTL`, `softDeleteFile`, `recoverFile`, `generatePermanentToken`, `revokePermanentToken`, `setReadOnly`, `setMentionRestricted` | `actions/file-config.ts` |
| Tags | `addTag`, `removeTag` · `GET /api/tags/autocomplete` | `actions/tags.ts` |
| Mentions | `addMention`, `removeMention` | `actions/mentions.ts` |
| Notes | `getCurrentNote`, `saveNote`, `getNoteHistory` | `actions/notes.ts` |
| Notifications | `getNotifications`, `markAsRead`, `markAllRead`, `getUnreadCount` | `actions/notifications.ts` |
| Roles / grants | `setSystemRole`, `grantFileRole`, `revokeFileRole` | `actions/roles.ts` |
| Search | `search(payload)` (`SearchFilters`) | `actions/search.ts` |
| Bulk download | `POST /api/files/bulk-download` (`{ fileIds }` → stream or `{ jobId }`) | `app/api/files/bulk-download` |
| Compression | `compress(payload)` | `actions/compress.ts` |
| Job status | `getJobStatus(id)` (add `getJob` action / `GET /api/jobs/[id]`) | `lib/jobs.ts` |
| Audit log / metrics | ⛔ not built | Phase 10 |

## Component Inventory (reuse — do not rebuild)

- **Scaffold:** `app-sidebar`, `nav-main`, `nav-documents`, `nav-secondary`, `nav-user`, `site-header`, `section-cards`, `chart-area-interactive`, `data-table`, `file-note-panel`.
- **shadcn/ui:** full set in `components/ui/` — `dialog`, `sheet`, `drawer`, `dropdown-menu`, `command`, `combobox`, `popover`, `table`, `card`, `badge`, `tabs`, `form`/`field`, `input`, `textarea`, `select`, `switch`, `calendar`, `skeleton`, `empty`, `sonner`, `tooltip`, `alert-dialog`, `progress`, `avatar`, `breadcrumb`, `pagination`, `scroll-area`, etc.

## Design Rules (every UI phase)

1. **shadcn-only.** Compose from `components/ui/*`; do not edit them. New feature components go in `components/` (kebab-case file, PascalCase export).
2. **RSC by default.** Fetch reads in Server Components by calling `lib/*` / read actions directly. Use Client Components only for interactivity (forms, dialogs, optimistic UI) and have them call the `actions/*` server actions.
3. **Payload fidelity.** Actions validate with Zod and many accept `unknown` — send the exact shape they parse. BigInt sizes arrive as **strings** (`size: string`); format via a small `lib/format.ts` helper (bytes + relative dates). Never `Number()` a size blindly.
4. **Server-grouped data renders as-is.** `FileBucket.label` is pre-computed server-side — render it; do not regroup client-side.
5. **Permission-aware, not permission-enforcing.** Hide/disable actions the user lacks (owner/admin/superadmin), but the handler is the real gate — UI is convenience only. Read access level from the file record / session.
6. **States everywhere.** Every async surface ships loading (`skeleton`), empty (`empty`), and error (toast via `sonner`) states. Mutations: optimistic where safe, `toast` on result, `router.refresh()` / revalidate after.
7. **Read-only & lifecycle respect.** Disable mutate controls when `isReadOnly` (show reason); reflect `deletedAt` (recycle bin), `expiresAt` (TTL badge), `visibility`, `isMentionRestricted` as badges.

## Working Agreement

Same as the backend plan: each numbered step = one agent action with its own acceptance criteria; tick [`../../PROGRESS.md`](../../PROGRESS.md) (UI section) when it passes. Build phases in order — `ui-00` shell first; everything else mounts inside it.
