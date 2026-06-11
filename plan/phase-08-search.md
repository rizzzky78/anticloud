# Phase 8 — Search

**Goal:** Permission-scoped Postgres full-text search over file names, tags, note content, and mention usernames, with Redis result caching and composable advanced filters.

**Depends on:** Phases 6 & 7 (tags, mentions, notes must exist to index). **Unlocks:** —

## Steps (agent actions)

### 8.1 — Search index
- Add Postgres full-text search infrastructure: a `tsvector` (generated column or maintained index) covering `displayName` + aggregated tags + current note body + mentioned usernames. Add a GIN index. Migrate.
- Decide refresh strategy (generated/triggered vs. maintained on write) and document it.
- **Accept:** a file is findable by its name, a tag, note content, and a mentioned username.

### 8.2 — Scoped query
- `lib/search.ts` — tokenize the query, match against the index, and **always scope to files the requester may see** (reuse `lib/permissions.ts`). Private files the user can't access never appear.
- **Accept:** search never leaks names/metadata from inaccessible private files.

### 8.3 — Result cache
- Cache recent results per user in Redis (`search:` namespace, short TTL). Identical query within window returns without hitting Postgres. Invalidate a user's search cache on their upload/tag/delete (hooks already stubbed in earlier phases — wire them here).
- **Accept:** repeated query is a cache hit; an upload/tag/delete by that user busts their search cache.

### 8.4 — Advanced filters
- Extend `lib/search.ts` to compose filters — tag, date range, uploader, file type, access level — into a **single** Postgres query (no in-memory post-filtering).
- **Accept:** combined filters resolve in one query and respect permission scope.

### 8.5 — Search UI
- Search bar + advanced filter panel + results using existing shadcn components and current color scheme. Reuse the date-grouped shape from Phase 4 where it fits.
- **Accept:** users search + filter and only see permitted results.

## Deliverables
FTS schema + GIN index + migration, `lib/search.ts` (scoped query + filters), search cache wiring, search UI.

## Out of scope
External search engines — Postgres FTS only.
