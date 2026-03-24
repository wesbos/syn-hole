# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is "Syntax Live Polls" — a realtime conference polling app built on Cloudflare Workers + PartyServer with a React 19 / TanStack Start frontend. It is a single-service full-stack app; `pnpm dev` starts everything (Vite dev server, Cloudflare Workers local runtime, Durable Objects with embedded SQLite).

### Running the dev server

```
pnpm dev
```

This starts the Vite dev server on `http://localhost:5173/`. No external databases or Docker containers are needed — all persistence uses Durable Object SQLite locally.

### Key URLs (dev)

| View | URL |
|------|-----|
| Audience (default room) | `http://localhost:5173/r/main-stage/` |
| Host (default room) | `http://localhost:5173/r/main-stage/host?hostKey=change-me` |
| Projector (default room) | `http://localhost:5173/r/main-stage/screen` |
| Admin | `http://localhost:5173/admin/?adminKey=change-me-admin` |

Default credentials in `wrangler.jsonc`: `HOST_KEY=change-me`, `ADMIN_KEY=change-me-admin`.

### Build & lint

- **Build:** `pnpm build`
- **TypeScript check:** `npx tsc --noEmit` (there is a pre-existing TS error in `src/server.ts` line 99 that does not block the dev server or build)
- **No dedicated lint or test scripts** are configured in `package.json`.

### Gotchas

- The `pnpm.onlyBuiltDependencies` field in `package.json` must list `esbuild`, `sharp`, and `workerd` to avoid the interactive `pnpm approve-builds` prompt. This is already configured.
- The `/` route redirects to `/r/main-stage/` automatically.
- Admin API endpoints require the `x-admin-key` header (value from `ADMIN_KEY` env var).
