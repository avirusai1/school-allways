# Staging deploy — School All Ways API

**Path chosen: systemd on the existing Oracle VPS.**  
Do not run docker-compose on this box. nginx and the Cloudflare tunnel
already own ports 80/443. `infra/docker-compose.yml` is the greenfield
Always Free layout (Caddy + containers) for a **new** VM that is not
already running nginx. Mixing the two will fight for 80/443.

This document is the checklist Abhishek runs. This task does **not** SSH
to production.

## Layout (server rulebook)

| | |
|---|---|
| App root | `/var/www/techallways_school` |
| Owner | `ubuntu:www-data` |
| Dirs | `775` |
| Files | `664` |
| Env | `/etc/saw/api.env` — `root:ubuntu`, mode `0640` |
| Unit | `infra/systemd/saw-api.service` → `/etc/systemd/system/saw-api.service` |
| Listen | `127.0.0.1:3000` (nginx / tunnel reverse-proxies TLS) |

Copy the unit:

```bash
sudo cp infra/systemd/saw-api.service /etc/systemd/system/saw-api.service
sudo systemctl daemon-reload
sudo systemctl enable saw-api
```

`/usr/bin/node` must be Node 22 (or at least 20.11). If Node lives under
nvm, change `ExecStart` in the unit to that binary — do not rely on an
interactive `PATH`.

## Env file

`/etc/saw/api.env` is a copy of `.env.example` with production/staging
secrets. It is **not** in the repo. Minimum that must be real:

- `DATABASE_URL` (owner role — migrations only)
- `DATABASE_APP_URL` (restricted `saw_app` role — the API process)
- `REDIS_URL`
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
- `API_BASE_URL=https://api.school.techallways.com`
- `APP_BASE_URL` and the `*_WEB_URL` origins used by CORS

`FIRM_GSTIN` unset is correct until the CA fills it. Invoice generation
must keep failing loud (`FIRM_GSTIN_MISSING`).

## Mobile `API_BASE_URL`

The Flutter apps bake the API origin in at **build** time:

```text
--dart-define=API_BASE_URL=https://api.school.techallways.com/v1
```

Note the `/v1` suffix — that is the Dio `baseUrl` in
`apps/mobile-family/lib/core/providers.dart` and
`apps/mobile-admin/lib/core/providers.dart`. The Nest env var
`API_BASE_URL` has **no** `/v1`.

CI uses the same dart-define (repo variable `MOBILE_API_BASE_URL`, default
the URL above). Changing the public API host means a new app build, not a
server restart.

## First deploy / update

On the VPS, as `ubuntu`, from `/var/www/techallways_school`:

```bash
git fetch origin
git checkout <tag-or-sha>
git submodule update --init --recursive  # if any

# 775/664 after checkout
sudo chown -R ubuntu:www-data /var/www/techallways_school
find /var/www/techallways_school -type d -exec chmod 775 {} \;
find /var/www/techallways_school -type f -exec chmod 664 {} \;

corepack enable
pnpm install --frozen-lockfile
pnpm --filter @saw/api build
pnpm --filter @saw/db migrate          # uses DATABASE_URL from the shell env
# Seed only on an empty database. Do not re-seed a live school.
# pnpm --filter @saw/db seed

sudo systemctl restart saw-api
sudo systemctl status saw-api --no-pager
curl -fsS http://127.0.0.1:3000/health
```

Export `DATABASE_URL` from `/etc/saw/api.env` for the migrate step
(`set -a; source /etc/saw/api.env; set +a`) so it is not pasted into the
shell history.

## Rollback

```bash
cd /var/www/techallways_school
git checkout <previous-sha>
pnpm install --frozen-lockfile
pnpm --filter @saw/api build
sudo systemctl restart saw-api
```

Migrations are forward-only in this repo. If the release included a
schema change, rolling back the **code** without a matching down-migration
will break. Prefer restoring the last `infra/scripts/backup-loop.sh`
snapshot onto a staging copy and cutting DNS only after `/health` is
green.

## What this does not start

- **BullMQ worker.** `infra/docker-compose.yml` defines a `worker`
  service (`node dist/worker.js`) that this tree does not yet ship as a
  systemd unit. Until that entrypoint exists, do not expect queued PDF /
  import / notification jobs to run out-of-process.
- **Postgres / Redis.** Assumed already installed on the VPS (or via the
  local compose file for a laptop).
- **Web frontends.** Cloudflare Pages, not this box.
