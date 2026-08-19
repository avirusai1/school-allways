# Staging deploy — School All Ways API

**Path chosen: systemd on the existing Oracle VPS.**  
Do not run docker-compose on this box. nginx and the Cloudflare tunnel
already own ports 80/443. `infra/docker-compose.yml` is the greenfield
Always Free layout (Caddy + containers) for a **new** VM that is not
already running nginx. Mixing the two will fight for 80/443.

This document is the checklist Abhishek runs. This task does **not** SSH
to production.

**2026-08-18 — reconciled against what is actually running.** A deploy
happened (by Cursor, during the subscription E2E proof) before this
document's process was ever followed end-to-end. Verified live via
read-only SSH recon: `saw-api.service` active since 2026-08-13, schema
migrated, `/api/health` returning `{"status":"ok","db":true,"redis":true}`
both locally and at `https://school.techallways.com/api/health`. The
sections below are corrected to match that reality, not the original plan.

## Layout (server rulebook) — as actually deployed

| | |
|---|---|
| App root | `/var/www/techallways_school` — **not a git checkout.** Whole repo tree (incl. `node_modules`, `db/`) was copied over directly; `git log` fails with "not a git repository." There is currently no reliable way to tell which commit is live from this directory alone. |
| Owner | `ubuntu:www-data` |
| Env | `/var/www/techallways_school/apps/api/.env.production` — **not** `/etc/saw/api.env` (that path does not exist on this box). `EnvironmentFile=` in the systemd unit points here. |
| Unit | `/etc/systemd/system/saw-api.service`, enabled, active |
| Listen | `127.0.0.1:3001` — **not 3000.** nginx proxies `/api/` here. |
| URL structure | **One domain, path-routed** — not subdomains as originally planned. `school.techallways.com/api/` → API, `/admin/`, `/family/`, `/control/` → those web apps as static builds under `/var/www/techallways_school/{admin,family,control}-site/`, `/` → marketing site. This is simpler than the subdomain plan: everything is same-origin, so CORS mostly isn't a concern. |
| Postgres / Redis | Already installed and running directly on the VPS (not containers), listening on `127.0.0.1` only — confirmed not reachable from outside. Redis currently has **no password set**, while `.env.production`'s `REDIS_URL` includes one — this mismatch makes the app's Redis cache-bust calls fail (logged as a warning, not fatal; falls back to a 5-minute TTL). Worth fixing but not urgent. |
| Backups | `infra/scripts/backup-loop.sh` is written for the docker-compose layout (hostname `postgres`, reads `POSTGRES_*` from container env) and is **not running on this box**. There is currently no automated backup of the live `school_all_ways` database. Needs a cron job or systemd timer running `pg_dump` directly against `127.0.0.1`, or adjust the script to work outside compose. |

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

`apps/api/.env.production` (inside the app root — see table above) is a
copy of `.env.example` with production secrets. It is **not** in the repo,
and it is **not** the same values as the root `.env` file that also exists
on the box — that root `.env` is stale (confirmed 2026-08-18: its
`saw_owner` password fails auth; only `apps/api/.env.production` matches
what's actually in Postgres). Always load config from
`apps/api/.env.production`, never the root `.env`. Minimum that must be
real:

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

**Not yet reconciled.** The steps below are the originally-planned,
git-based process. The actual first deploy did not follow it — the app
root is a raw file copy, not a git checkout, so `git fetch`/`git checkout`
will fail here today (`fatal: not a git repository`). Before running any
"update," decide and document how code actually gets from a laptop /
CI onto this box (rsync of a fresh build, scp of `dist/` + built static
sites, or turning the app root into a real git checkout first). Until
that decision is made, treat this section as aspirational, not a runbook.

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
curl -fsS http://127.0.0.1:3001/health
```

Export `DATABASE_URL` from `apps/api/.env.production` for the migrate step
(`set -a; source <(sudo cat apps/api/.env.production); set +a`) so it is
not pasted into the shell history.

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
- **Postgres / Redis.** Confirmed installed and running directly on the
  VPS (not containers) — see the layout table above.
- **Web frontends.** Confirmed served from this box (see "URL structure"
  above), not Cloudflare Pages as originally planned.
