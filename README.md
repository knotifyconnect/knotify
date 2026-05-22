# knotify Munich MVP

Monorepo for NodeNet with:
- `apps/web`: React + Vite frontend
- `apps/api`: Express + PostgreSQL backend
- `packages/shared`: shared TypeScript types
- `supabase/migrations`: SQL migrations

## Quick start

1. Install deps

```bash
pnpm install
```

2. Copy env files

```bash
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

3. Run dev servers

```bash
pnpm dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3001`
