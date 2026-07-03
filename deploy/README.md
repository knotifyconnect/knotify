# Knotify pilot deployment

## Architecture

- Cloudflare Pages serves `apps/web/dist`.
- Caddy terminates HTTPS for the API.
- The Node API listens only on `127.0.0.1:3001`.
- Ollama listens only on `127.0.0.1:11434`.
- Supabase remains the managed database and authentication provider.

## Release boundary

Do not deploy an uncommitted working tree. Create a reviewed release commit first. Migrations are applied separately and only after reviewing the target Supabase project.

## VM filesystem

- `/opt/knotify/current`: checked-out release
- `/etc/knotify/api.env`: API secrets, mode `0600`
- `/etc/systemd/system/knotify-api.service`: API service
- `/etc/systemd/system/ollama.service.d/knotify.conf`: Ollama override
- `/etc/caddy/Caddyfile`: HTTPS reverse proxy

## Runtime version

Use Node 22.16.0 for the VM and Cloudflare Pages. The repository pins this version in `.node-version`; `pdfjs-dist` requires Node 22.13.0 or newer.

## Build on the ARM VM

```text
npm ci
npm run build --workspace @nodenet/shared
npm run build --workspace @nodenet/api
```

The API service runs `apps/api/dist/index.js` directly. It does not run TypeScript or npm in production.

## Security invariants

- `SUPABASE_SERVICE_ROLE_KEY` and other server secrets never enter Cloudflare Pages.
- `ALLOWED_ORIGIN` contains exact HTTPS frontend origins only.
- Ports `3001` and `11434` are not opened in the cloud firewall.
- Only ports `22`, `80`, and `443` are exposed on the VM.
- The API enforces a 10 MB CV upload limit and a 15 MB JSON body limit.
- Ollama cloud features remain disabled for private CV processing.

## Deployment order

1. Create and review a clean release commit.
2. Provision the VM and install Node 22.16.0, Caddy, and Ollama ARM64.
3. Copy the release to `/opt/knotify/current` and build it.
4. Create `/etc/knotify/api.env` from `deploy/env/api.env.example`.
5. Install the systemd and Caddy files.
6. Pull the configured Ollama model.
7. Verify `/health`, `/health/db`, and `/health/ai` locally on the VM.
8. Point the API DNS record to the VM and verify HTTPS.
9. Configure Supabase Auth site and redirect URLs.
10. Deploy the frontend through Cloudflare Pages.
11. Run the remote pilot acceptance path before inviting users.
