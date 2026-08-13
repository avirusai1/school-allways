#!/usr/bin/env bash
# =============================================================================
# Cross-tenant leak test.
#
# Proves, against a real Postgres, that the restricted `saw_app` role cannot
# read across tenants no matter what SQL it runs. This is the single most
# important test in the repository: if it fails, one school can read another
# school's children's data.
#
# It deliberately tests the DATABASE layer, not the API. Application guards
# can be bypassed by a bug; Row Level Security cannot be bypassed by a role
# that is NOSUPERUSER and NOBYPASSRLS.
#
# Usage (CI sets these):
#   DATABASE_URL=postgres://saw_owner:...  # owner, applies fixtures
#   APP_URL=postgres://saw_app:...         # restricted, under test
# =============================================================================

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL (owner) must be set}"
: "${APP_URL:?APP_URL (restricted saw_app role) must be set}"

RED=$'\e[31m'; GREEN=$'\e[32m'; RESET=$'\e[0m'
failures=0

pass() { echo "${GREEN}PASS${RESET}  $1"; }
fail() { echo "${RED}FAIL${RESET}  $1"; failures=$((failures + 1)); }

echo
echo "Cross-tenant isolation test"
echo

# --- Fixtures: two tenants, one student each --------------------------------
TENANT_A=$(uuidgen | tr 'A-Z' 'a-z')
TENANT_B=$(uuidgen | tr 'A-Z' 'a-z')

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
INSERT INTO tenants (id, slug, name, status)
VALUES ('$TENANT_A', 'leak-test-a', 'Leak Test School A', 'active'),
       ('$TENANT_B', 'leak-test-b', 'Leak Test School B', 'active');

INSERT INTO branches (id, tenant_id, code, name)
VALUES (gen_random_uuid(), '$TENANT_A', 'MAIN', 'A Main'),
       (gen_random_uuid(), '$TENANT_B', 'MAIN', 'B Main');

INSERT INTO students (id, tenant_id, branch_id, admission_no, first_name)
SELECT gen_random_uuid(), b.tenant_id, b.id, 'ADM-001',
       CASE WHEN b.tenant_id = '$TENANT_A' THEN 'StudentOfA' ELSE 'StudentOfB' END
FROM branches b
WHERE b.tenant_id IN ('$TENANT_A', '$TENANT_B');
SQL

query_as_tenant() {
  local tenant="$1" sql="$2"
  # -q suppresses the BEGIN/COMMIT command-completion tags Postgres prints
  # for transaction control statements. -t alone does not: it only silences
  # SELECT row-count footers. Without -q, `| tail -1` below picks up the
  # literal word "COMMIT" instead of the query result — which is exactly
  # what happened the first time this script ran to completion.
  psql "$APP_URL" -q -t -A -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT set_config('app.tenant_id', '$tenant', true);
$sql
COMMIT;
SQL
}

# --- 1. Baseline: tenant A sees exactly its own student ----------------------
count_a=$(query_as_tenant "$TENANT_A" "SELECT count(*) FROM students;" | tail -1)
[[ "$count_a" == "1" ]] \
  && pass "tenant A sees exactly 1 student" \
  || fail "tenant A saw '$count_a' students, expected 1"

name_a=$(query_as_tenant "$TENANT_A" "SELECT first_name FROM students;" | tail -1)
[[ "$name_a" == "StudentOfA" ]] \
  && pass "tenant A sees its OWN student" \
  || fail "tenant A saw '$name_a', expected StudentOfA"

# --- 2. The attack: ask explicitly for the other tenant's rows ---------------
leaked=$(query_as_tenant "$TENANT_A" \
  "SELECT count(*) FROM students WHERE tenant_id = '$TENANT_B';" | tail -1)
[[ "$leaked" == "0" ]] \
  && pass "explicit WHERE tenant_id = B returns nothing" \
  || fail "LEAK: tenant A read $leaked of tenant B's students"

# --- 3. No tenant context set at all -> nothing, not everything -------------
no_ctx=$(psql "$APP_URL" -q -t -A <<SQL | tail -1
BEGIN;
SELECT set_config('app.tenant_id', '', true);
SELECT count(*) FROM students;
COMMIT;
SQL
)
[[ "$no_ctx" == "0" ]] \
  && pass "no tenant context returns 0 rows (fails closed)" \
  || fail "LEAK: unscoped query returned $no_ctx students"

# --- 4. The app role must not be able to turn RLS off ------------------------
if psql "$APP_URL" -q -c "ALTER TABLE students DISABLE ROW LEVEL SECURITY;" 2>/dev/null; then
  fail "CRITICAL: saw_app was able to DISABLE row level security"
else
  pass "saw_app cannot disable row level security"
fi

# --- 5. ... nor write into another tenant ------------------------------------
# Without -v ON_ERROR_STOP=1, psql does NOT exit non-zero when a statement
# inside the script errors — it prints the error, treats the now-aborted
# transaction's COMMIT as a no-op, and still exits 0. That reads as "the
# insert succeeded" even when RLS correctly blocked it. -t -A also added so
# the SELECT set_config(...) result doesn't print a stray table between the
# PASS/FAIL lines.
if psql "$APP_URL" -q -t -A -v ON_ERROR_STOP=1 <<SQL >/dev/null 2>/dev/null
BEGIN;
SELECT set_config('app.tenant_id', '$TENANT_A', true);
INSERT INTO students (id, tenant_id, branch_id, admission_no, first_name)
SELECT gen_random_uuid(), '$TENANT_B', id, 'HACK-001', 'Injected'
FROM branches WHERE tenant_id = '$TENANT_B' LIMIT 1;
COMMIT;
SQL
then
  fail "CRITICAL: tenant A inserted a row into tenant B"
else
  pass "tenant A cannot INSERT into tenant B (WITH CHECK holds)"
fi

# --- 6. Audit tables are append-only -----------------------------------------
# Same fix: ON_ERROR_STOP so a policy-blocked DELETE actually reports as a
# psql failure instead of a silently-successful exit 0.
if psql "$APP_URL" -q -v ON_ERROR_STOP=1 -c "DELETE FROM audit_logs;" >/dev/null 2>/dev/null; then
  fail "audit_logs is deletable by the app role"
else
  pass "audit_logs cannot be deleted by the app role"
fi

# --- 7. Every tenant-scoped table actually has a policy ----------------------
unprotected=$(psql "$DATABASE_URL" -t -A <<'SQL' | tail -1
SELECT count(*)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false;
SQL
)
[[ "$unprotected" == "0" ]] \
  && pass "every table with tenant_id has RLS enabled" \
  || fail "$unprotected table(s) with tenant_id have RLS DISABLED"

# --- Cleanup -----------------------------------------------------------------
psql "$DATABASE_URL" -q -c "DELETE FROM tenants WHERE id IN ('$TENANT_A','$TENANT_B');"

echo
if [[ $failures -gt 0 ]]; then
  echo "${RED}$failures isolation failure(s). DO NOT DEPLOY.${RESET}"
  exit 1
fi
echo "${GREEN}All isolation checks passed.${RESET}"
echo
