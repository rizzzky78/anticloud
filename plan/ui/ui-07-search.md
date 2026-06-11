# UI-07 — Search & Filters

**Goal:** A ⌘K command-palette quick search plus a full `/search` results page with composable advanced filters, all bound to the `search` action (permission-scoped server-side).

**Depends on:** ui-00, Phase 8 (`actions/search.ts` exists; `searchFiles` + `SearchFilters`). **Unlocks:** —

## Steps (agent actions)

### 07.1 — Command palette
- `components/search-command.tsx` (Client, `ui/command` dialog) opened by the header ⌘K trigger (ui-00). Debounced query → `search({ q })`. Show top results (name + type icon + bucket); Enter → `/files/[id]`; "See all results" → `/search?q=`.
- **Accept:** typing returns scoped matches; results never include files the user can't access.

### 07.2 — Search results page (RSC)
- `app/(app)/search/page.tsx`: read `q` + filters from `searchParams`, call the search action, render results reusing `components/file-list.tsx` (ui-02). Show result count + active-filter chips.
- **Accept:** results render with the same row UI; empty query shows guidance, no matches shows empty state.

### 07.3 — Advanced filter panel
- `components/search-filters.tsx` (`ui/sheet` or sidebar): compose `SearchFilters` — tags (autocomplete combobox), date range (`ui/calendar` range), uploader (user picker), file type (`ui/select` by mime group). Filters serialize to `searchParams` → single server query (no client post-filter).
- **Accept:** combining filters narrows results in one query; clearing a chip updates the URL + results.

### 07.4 — Search states & caching note
- Loading skeleton, empty state, error toast. Document that identical queries hit the Redis result cache server-side (no client cache needed).
- **Accept:** rapid identical searches feel instant (server cache); UI shows proper states.

## Components used
`ui/command`, `ui/dialog`, `ui/sheet`, `ui/calendar`, `ui/select`, `ui/combobox`, `ui/badge`, `ui/kbd`, `ui/skeleton`, `ui/empty`; reuse `components/file-list.tsx`.

## Out of scope
Saved searches / search analytics (not in backend scope).
