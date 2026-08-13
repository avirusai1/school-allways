#!/usr/bin/env bash
# Bring up local Postgres/Redis, migrate, apply RLS/sync SQL, seed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="/Applications/Docker.app/Contents/Resources/bin:${PATH}"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example and fill secrets first." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

psql_exec() {
  docker compose -f infra/docker-compose.local.yml --env-file .env exec -T postgres \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 "$@"
}

echo "==> Starting local Postgres + Redis"
docker compose -f infra/docker-compose.local.yml --env-file .env up -d

echo "==> Waiting for Postgres"
for i in $(seq 1 60); do
  if docker compose -f infra/docker-compose.local.yml --env-file .env exec -T postgres \
    pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> Bootstrap roles (needed before migrations that GRANT to saw_app)"
psql_exec < db/sql/000_bootstrap_roles.sql
psql_exec -c "ALTER ROLE saw_app WITH PASSWORD '${POSTGRES_PASSWORD}'; ALTER ROLE saw_readonly WITH PASSWORD '${POSTGRES_PASSWORD}';"

echo "==> Drizzle migrate"
pnpm db:migrate

echo "==> Apply extensions / sync / RLS SQL"
psql_exec < db/sql/001_extensions_and_sync.sql
psql_exec < db/sql/002_rls.sql
psql_exec < db/sql/003_auth_acting_user.sql
psql_exec < db/sql/004_join_token_lookup.sql
psql_exec < db/sql/005_public_signup.sql
psql_exec < db/sql/006_platform_grants.sql
psql_exec -c "ALTER ROLE saw_app WITH PASSWORD '${POSTGRES_PASSWORD}'; ALTER ROLE saw_readonly WITH PASSWORD '${POSTGRES_PASSWORD}';"
psql_exec -c "SELECT app_apply_tenant_rls(); SELECT app_attach_sync_triggers();"
# app_apply_tenant_rls() just re-granted UPDATE/DELETE on every tenant table,
# including audit_logs and pii_access_logs — undoing the REVOKE that
# 002_rls.sql placed further up (it warns about exactly this in its own
# comment). Whenever this function is called again after 002_rls.sql, the
# REVOKE must be re-run in the same breath, or the audit trail is silently
# mutable by the app role. Found 2026-08-13 via a tenant-isolation test that
# had never actually completed a run before.
psql_exec -c "REVOKE UPDATE, DELETE ON public.audit_logs FROM saw_app; REVOKE UPDATE, DELETE ON public.pii_access_logs FROM saw_app;"

echo "==> Seed catalogues + demo school"
pnpm db:seed
pnpm db:seed:demo
# Sunrise is seeded onboarding-complete, so keep an un-onboarded tenant around
# or the setup wizard can only be tested by hand-editing the database.
pnpm db:seed:onboarding

echo ""
echo "Local stack ready."
echo "  API:  pnpm --filter @saw/api start"
echo "  Web:  pnpm --filter @saw/web-admin dev"
echo "  APK:  pnpm build:android"
echo "        pnpm build:android:device"
echo ""
echo "Demo logins: principal@sunrise.demo / Demo@12345"
echo "Parent OTP:  919876543210 (devOtp in API response)"
echo "Wizard test: admin@onboarding.demo / Demo@12345 (un-onboarded tenant)"
