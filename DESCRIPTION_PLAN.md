# Nextcloud Clone — Implementation Plan

## Overview

This document outlines the conceptual implementation plan for a customized Nextcloud-like file management platform built on a modern Next.js stack. The plan focuses purely on architecture, data flow, feature logic, and system design — not UI, database schemas, or code.

---

## Core Architecture Philosophy

The system is designed around three separation concerns: **identity and access**, **file lifecycle management**, and **metadata intelligence**. Every feature either belongs to one of these pillars or bridges between them. The Next.js App Router serves as the unified interface layer, with Server Actions and Route Handlers acting as the boundary between client intent and server-side execution.

MinIO handles all binary concerns — nothing binary ever touches PostgreSQL. PostgreSQL owns all relational truth: ownership, permissions, tags, notes, metadata. Redis acts as the system's short-term memory — caching hot data, enforcing rate limits, and holding ephemeral session state. Better-Auth sits at the entry gate, producing verified identity tokens that every subsequent layer trusts without re-verifying against the database on every request.

---

## 1. Authentication Layer

Better-Auth is configured for username and password only — no OAuth, no magic links. The session produced by Better-Auth contains the authenticated user's identity and is stored in an HTTP-only cookie. All server-side code reads from this session to determine who is acting.

Redis holds session data with a TTL. On each authenticated request, the session is refreshed if the user is active. Expired sessions force re-authentication silently on the next request. This means the database is never hit for session validation — Redis answers that question alone.

Rate limiting on the login endpoint is enforced at the middleware level using Redis counters keyed by IP address and username combination. After a configurable threshold of failed attempts within a time window, the account is temporarily locked and further attempts are silently delayed rather than immediately rejected, preventing timing-based enumeration.

---

## 2. RBAC System

The platform defines four roles: **superadmin**, **admin**, **viewer**, and **guest**. These roles operate at two levels — system-level and file-level — and they interact differently.

At the system level, superadmin has unrestricted access to all files, users, and configuration. Admin can manage users and files within their scope but cannot alter system configuration. Viewer can only read and download files they have access to. Guest is any unauthenticated visitor — they can only access files explicitly marked as public and configured for guest access.

At the file level, RBAC is more granular. A file has an owner. The owner can grant specific users access at a specific role level for that file. This means a system-level viewer could be granted admin-level access to a specific file by its owner. File-level permissions always override system-level permissions downward, never upward — a system-level guest cannot be elevated beyond viewer at the file level.

Permission resolution happens in a defined order: first check if the user is superadmin (bypass everything), then check file-level explicit grants for that user, then fall back to the file's visibility setting (public or private), then deny.

---

## 3. File Storage Architecture

MinIO is the single source of truth for binary content. When a file is uploaded, it is streamed directly from the client through the Next.js Route Handler to MinIO — never written to disk on the application server. The MinIO object key is an internal UUID-based path that has no relationship to the user-visible file name. The user-visible name, path, tags, and all other metadata live exclusively in PostgreSQL.

This separation means that renaming a file, moving it, or changing its metadata is a pure database operation — MinIO is never touched. Only actual binary replacement triggers a MinIO write.

Files are organized in MinIO under a flat namespace with a structured prefix — for example, by tenant or by upload date — purely for operational manageability. The application layer never constructs or interprets MinIO paths directly; a dedicated storage service module owns that mapping.

---

## 4. File Lifecycle and Configuration

Each file carries a configuration envelope that governs its behavior over time. This configuration includes:

**TTL (Time-to-Live):** A file can have an expiry timestamp. A background job (implemented as a Next.js cron route or an external worker) periodically scans for expired files, removes them from MinIO, and marks them as deleted in PostgreSQL. Soft-deletion is used first — the record remains but is flagged — allowing for a grace period before hard deletion. Superadmins can recover soft-deleted files within the grace window.

**Permanent Presigned URLs:** A file can be configured to generate a presigned MinIO URL that never expires (or has a very long TTL). This URL is stored in PostgreSQL alongside the file record. When the file is accessed via this URL, the system validates the URL token against the stored value and the file's current permission state before serving. This means even a permanent URL can be invalidated by changing the file's visibility or revoking access — the URL itself is just a token, not a capability.

**Read-Only Mode:** A file marked as read-only prevents any authenticated user (including the owner) from replacing or deleting it without first explicitly lifting the read-only flag. This is a soft lock implemented at the application layer — the API rejects mutation operations on read-only files with a clear reason. Superadmin can override this.

**Mention-Restricted Access:** A file can be configured so that only users who have been mentioned in that file's metadata are able to access it, regardless of their system role. This is an additive restriction — it narrows the access pool below what RBAC would normally allow. The mention list is stored as a relation in PostgreSQL and is checked during permission resolution after RBAC evaluation.

---

## 5. File Grouping by Date

Files in list views are grouped by their upload date on the server side. The grouping logic lives in a server-side data-fetching function that queries files ordered by creation timestamp and groups them into buckets — Today, Yesterday, This Week, This Month, and then by calendar month for older files.

This grouping is computed during the query phase using PostgreSQL's date truncation capabilities rather than in application memory, keeping large result sets efficient. The response shape carries pre-grouped data so the client renders without any additional computation.

---

## 6. Search

Search is implemented as a server-side query against PostgreSQL using full-text search capabilities. The search index covers file names, tags, note content, and mention usernames. When a user submits a search query, it is tokenized and matched against this index.

Redis caches recent search results per user with a short TTL. Identical queries within the cache window return instantly without hitting PostgreSQL. Cache invalidation for a user's search cache is triggered when they upload, tag, or delete files.

Search results respect the user's permission scope — the query is always scoped to files the requesting user is allowed to see. This means search never leaks file names or metadata from private files the user has no access to.

Advanced search supports filtering by tag, date range, uploader, file type, and access level. These filters are composed into a single PostgreSQL query rather than post-filtering in memory.

---

## 7. File Tagging and User Mentions

Tags are free-form text labels attached to files. A file can carry multiple tags. Tags are stored as a normalized relation — a tags table with unique tag values and a junction table linking tags to files. This allows efficient querying of all files with a given tag and all tags on a given file.

Tag autocomplete is powered by a Redis sorted set that tracks tag usage frequency. When a tag is applied, its score in the sorted set is incremented. The autocomplete endpoint queries Redis for the top matching tags by prefix, falling back to PostgreSQL for tags not yet in the cache.

User mentions work similarly. Mentioning a user in a file's metadata creates a relation between that file and the mentioned user. This relation serves two purposes: it notifies the mentioned user (via an in-app notification stored in PostgreSQL) and, if the file is configured as mention-restricted, it grants that user access to the file. Mentions can be added or removed by the file owner or admins.

---

## 8. File Notes

File notes are freeform text attachments to a file, shared across all users who have access to that file. Notes are versioned — each edit creates a new version record rather than overwriting the previous one. The current note is the latest version. Previous versions are accessible to admins and the file owner.

Notes are stored in PostgreSQL alongside authorship and timestamp. When a note is edited, the editor's identity is recorded. This creates an audit trail of note changes.

Redis caches the current note for hot files. Cache is invalidated immediately on any note write. This means note reads are fast for popular files without staleness risk during edits.

Notes are included in the full-text search index, meaning a user can find a file by searching for content within its notes, subject to their access permissions.

---

## 9. Public and Private Files

Every file has a visibility setting: **public** or **private**. Private files are only accessible to users with explicit grants or the owner. Public files are accessible to any authenticated user by default, and optionally to guests if further configured.

**Unowned files** are a special category — files that have been uploaded without associating them to a specific user account (for example, uploaded via an API token without user context, or by a superadmin as a system resource). Unowned files can be public or private. Private unowned files are only accessible to admins and superadmins. Public unowned files follow the same rules as public owned files.

The distinction between owned and unowned matters for cleanup and expiry logic — orphaned files (where the owner account has been deleted) are automatically converted to unowned rather than deleted, preserving the file's availability according to its visibility setting.

---

## 10. Bulk Download

Bulk download allows a user to select multiple files and download them as a single archive. The selection is submitted to a server-side endpoint that validates the user's access to each selected file individually before including it in the archive. Files the user cannot access are silently excluded from the archive (with a manifest file inside the archive listing what was excluded and why).

The archive is assembled server-side by streaming each file from MinIO and piping it through a compression stream. The resulting archive is streamed directly to the client response without being written to disk. This is the same mechanism used for single-file server-side compression.

For large selections, the archive generation is offloaded to a background job. The client receives a job ID and polls a status endpoint (backed by Redis for job state) until the archive is ready, then receives a short-lived presigned URL to download the completed archive from a temporary MinIO location. The temporary archive is deleted from MinIO after the TTL expires.

---

## 11. Server-Side File Compression

Individual files can be compressed on demand through the API. Compression is triggered explicitly by the user (not automatic on upload) and runs server-side. The compression job pulls the file from MinIO, compresses it using an appropriate algorithm based on file type, and stores the result as a new file object in MinIO, linked to the original in PostgreSQL as a derived version.

The original file is preserved unless the user explicitly chooses to replace it. This means compression is non-destructive by default. The user can see both the original and compressed version and choose which to make the canonical file.

Compression jobs are tracked in PostgreSQL with status fields. Redis holds the in-progress state for real-time status polling from the client. Completed jobs update the PostgreSQL record and invalidate relevant Redis cache keys.

---

## 12. Caching Strategy

Redis serves multiple distinct caching purposes, each with its own key namespace and TTL policy:

**Session cache** holds active user sessions with a sliding TTL reset on activity.

**Permission cache** holds resolved permission decisions for user-file pairs. This prevents re-running the full permission resolution logic on every file access. Cache is invalidated when a file's permission configuration changes or when a user's role changes.

**File metadata cache** holds frequently accessed file records. Invalidated on any write to that file's metadata.

**Search result cache** holds recent search results per user. Short TTL (seconds to minutes) to balance freshness with performance.

**Tag frequency cache** holds the sorted set of tag usage counts for autocomplete.

**Job state cache** holds the status of background jobs (compression, bulk archive generation). Cleared when jobs complete and their results are written to PostgreSQL.

---

## 13. API Layer and Middleware

All API endpoints are implemented as Next.js Route Handlers. Middleware runs before every request to resolve authentication state from the session cookie and attach the user identity to the request context. Unauthenticated requests to protected endpoints are rejected at the middleware level before any handler logic runs.

Rate limiting middleware reads from Redis counters keyed by user ID (or IP for unauthenticated requests) and enforces per-endpoint limits. Limits are configurable per endpoint category — upload limits are stricter than read limits, for example.

All file mutation endpoints (upload, rename, delete, configure) go through a permission check middleware that resolves the current user's access level for the target file before the handler runs. The handler never re-checks permissions — it trusts the middleware has already validated them. This centralizes permission logic and prevents accidental bypasses in individual handlers.

---

## 14. Background Jobs

Several features require asynchronous work that cannot block the HTTP request cycle. These include TTL expiry cleanup, bulk archive generation, and file compression. These jobs are implemented as cron-triggered Next.js Route Handlers for simple periodic work, or as queue-backed workers for user-triggered async operations.

The job queue is backed by Redis using a list-based queue pattern. Job producers push job descriptors onto the queue. A worker process (a long-running Node.js process or a serverless function on a schedule) pops jobs and executes them. Job results are written back to PostgreSQL. Job status is available via a polling endpoint during execution.

Failed jobs are retried with exponential backoff up to a configurable limit. Permanently failed jobs are moved to a dead-letter queue and flagged in PostgreSQL for manual review by a superadmin.

---

## 15. Audit and Observability

Every significant action — file upload, download, permission change, deletion, configuration change — is written to an audit log in PostgreSQL. The audit record captures who did what, to which file, at what time, and from which IP. This log is append-only and cannot be modified or deleted through the application API.

Superadmins can query the audit log filtered by user, file, action type, and date range. This provides accountability and supports compliance requirements.

Application-level metrics (request counts, error rates, job queue depth, cache hit rates) are exposed via a metrics endpoint compatible with Prometheus scraping — consistent with the existing monitoring infrastructure already in the broader platform context.
