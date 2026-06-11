# `lib/` — service clients & primitives

Foundation layer every later phase imports. Each module has a **single
responsibility** and a single owner of its concern. Keep these rules intact.

## Modules

| Module | Responsibility | Rule |
|---|---|---|
| [`env.ts`](env.ts) | Parse + validate `process.env` with Zod at load; export typed `env`. | **Only** reader of `process.env`. Fails fast on missing/invalid vars. |
| [`db.ts`](db.ts) | Singleton `PrismaClient` via the Postgres driver adapter. | Hot-reload safe. Lazy — no connection on import. |
| [`redis.ts`](redis.ts) | Singleton ioredis client + key-namespace convention (`NS`, `redisKey`). | All keys use a declared namespace prefix. Lazy connect. |
| [`cache.ts`](cache.ts) | JSON helpers over Redis: `getJSON`, `setJSON`, `del`, `delByPrefix`. | Phases use these instead of hand-rolling serialization. |
| [`storage.ts`](storage.ts) | Singleton MinIO client + object helpers + `buildObjectKey`. | **Only** module that talks to MinIO or builds/parses object keys. |
| [`result.ts`](result.ts) | `AppError` (code/message/status) + `toApiError()`. | Handlers serialize only `{ code, message }`; never leak stacks. |
| [`utils.ts`](utils.ts) | `cn()` Tailwind class merge (shadcn/ui). | UI utility only. |

## Conventions

- **Config**: read it via `import { env } from "@/lib/env"`. Nothing else touches `process.env`.
- **Binary**: read/write via `lib/storage.ts`. PostgreSQL holds relational truth; MinIO holds bytes. Metadata ops never touch MinIO.
- **Caching**: keys go through `redisKey(NS.x, ...)`; values through `cache.ts`.
- **Errors**: throw `AppError`; convert at the boundary with `toApiError()`.

## Directory skeleton

```
lib/      service clients & primitives (this dir)
actions/  server actions ("use server") — added in later phases
app/api/  Next.js Route Handlers — added in later phases
```

File names are `kebab-case`; exported components are `PascalCase` (see `CLAUDE.md`).
