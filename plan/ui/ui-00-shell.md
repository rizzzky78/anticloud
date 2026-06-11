# UI-00 — Authenticated Shell & Navigation

**Goal:** The `(app)` layout every authenticated screen mounts into — real sidebar nav, header with search trigger + notifications + user menu, providers (theme, toast), and the shared loading/empty/error conventions. Replace the Acme demo data with real product nav.

**Depends on:** Phases 0–1 (auth). **Unlocks:** every other UI phase.

## Steps (agent actions)

### 00.1 — App route group + layout
- Create `app/(app)/layout.tsx` (Server Component): guard with `getCurrentUser()` (`lib/auth-context.ts`) → redirect to `/sign-in` if null. Render `SidebarProvider` + `AppSidebar` + `SidebarInset` + `SiteHeader` (mirror `app/dashboard/page.tsx` structure). Pass the real user into the tree.
- Move/retire the demo `app/dashboard/page.tsx` (keep as `/(app)/files` landing or remove).
- **Accept:** unauthenticated hit redirects; authenticated user sees the shell.

### 00.2 — Real sidebar nav
- Edit `components/app-sidebar.tsx` (not `components/ui/*`): replace `navMain`/`documents`/Acme branding with product nav → **Files**, **Search**, **Notifications**, and a role-gated **Admin** group (Users, Recycle Bin). Brand = "Anticloud". Use existing lucide icons already imported.
- Drive `NavUser` from the real session (name/username/avatar) instead of the hardcoded `shadcn` user.
- **Accept:** nav links route to real `(app)/*` paths; admin group only shows for admin/superadmin.

### 00.3 — Header: search + notifications + user
- Extend `components/site-header.tsx`: add a ⌘K **search trigger** (opens the command palette — wired in [ui-07](ui-07-search.md)), a **notifications bell** with unread badge (`getUnreadCount` — wired in [ui-08](ui-08-notifications.md)), and the user dropdown (sign-out via `signOut`).
- Keep breadcrumb slot for file/folder context.
- **Accept:** header renders the three controls; bell shows a count placeholder until ui-08 binds it.

### 00.4 — Providers & theme
- Ensure root `app/layout.tsx` wraps with `next-themes` provider and mounts `<Toaster />` (sonner). Add a theme toggle in the user menu (light/dark/system).
- **Accept:** theme persists across reloads; toasts render globally.

### 00.5 — Shared UI primitives (feature-level)
- Create `lib/format.ts`: `formatBytes(size: string)`, `formatRelativeDate(iso)`, `formatDate(iso)` — used everywhere file size/dates show (sizes are BigInt **strings**).
- Create reusable state components: `components/empty-state.tsx` (wraps `ui/empty`), `components/loading-rows.tsx` (wraps `ui/skeleton`), `components/error-state.tsx`. 
- **Accept:** a sample screen can show loading → empty → data using these.

### 00.6 — Access-level helper for UI
- Create `lib/ui-access.ts` (or hook) exposing the current user's system role + a `canManage(file)` helper for conditional rendering (mirrors `resolveAccess` outcomes; **display only**).
- **Accept:** components can gate buttons without re-implementing permission logic.

## Components used
`ui/sidebar`, `ui/breadcrumb`, `ui/dropdown-menu`, `ui/avatar`, `ui/badge`, `ui/button`, `ui/tooltip`, `ui/skeleton`, `ui/empty`, `ui/sonner`; scaffold `app-sidebar`, `site-header`, `nav-*`.

## Out of scope
Binding search/notifications data (ui-07, ui-08) — only the triggers/slots here.
