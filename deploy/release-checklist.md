# Knotify pilot release checklist

## Release source

- [ ] Review all intended source changes.
- [ ] Exclude local repair scripts, diagnostic ZIPs, and `.env` files.
- [ ] Create one clean release commit.
- [ ] Record the release commit SHA.
- [ ] Push only after explicit approval.

## Database

- [ ] Capture the remote Supabase migration list.
- [ ] Confirm migrations `048_cv_profile_import.sql` and `049_service_role_data_access.sql` are not already represented remotely under different names.
- [ ] Create a backup or confirm the available restore path.
- [ ] Apply migrations separately from the application deployment.
- [ ] Verify RLS and the CV import RPC after migration.

## API VM

- [ ] Use an ARM64 Ubuntu VM with enough available memory for the selected model.
- [ ] Install Node 22.16.0, Caddy, and Ollama ARM64.
- [ ] Keep ports `3001` and `11434` private.
- [ ] Create `/etc/knotify/api.env` with mode `0600`.
- [ ] Install and enable the systemd units.
- [ ] Pull and smoke-test the document model.
- [ ] Verify API restart and VM reboot recovery.

## Supabase Auth

- [ ] Set the production Site URL.
- [ ] Add the production and required preview redirect URLs.
- [ ] Confirm email templates and reset-password links use the production frontend URL.

## Cloudflare Pages

- [ ] Configure the core and legal `VITE_*` variables listed in `deploy/cloudflare/pages-settings.txt`.
- [ ] Keep `KNOTIFY_PRODUCTION_BRANCHES` aligned with the protected Cloudflare production branch.
- [ ] Build from the protected release branch.
- [ ] Attach the frontend custom domain.
- [ ] Confirm SPA deep-link refreshes work.

## Acceptance

- [ ] `/health` returns 200.
- [ ] `/health/db` returns 200.
- [ ] `/health/ai` reports the configured model.
- [ ] Signup, login, logout, and password reset work.
- [ ] CV upload, review, and apply work remotely.
- [ ] Existing profile values remain protected.
- [ ] Mobile browser smoke passes.
- [ ] No secret appears in frontend assets or browser network responses.
