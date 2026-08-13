-- =========================================================================
-- School All Ways — Tenant isolation via PostgreSQL Row Level Security
--
-- THIS FILE IS THE SINGLE MOST IMPORTANT PIECE OF SECURITY IN THE PRODUCT.
-- One school must never see another school's data. RLS is layer 1 of 4;
-- see docs/03-tech-stack-and-infra.md §5 for the other three.
--
-- HOW IT WORKS
--   1. The API connects as role `saw_app`, which is NOT a superuser and does
--      NOT have BYPASSRLS. Even a successful SQL injection cannot escape it.
--   2. Every request opens a transaction and runs:
--        SELECT set_config('app.tenant_id', '<uuid-from-verified-JWT>', true);
--      `true` = LOCAL, so it dies with the transaction. A pooled connection
--      can never leak tenant context into the next request.
--   3. Policies below compare tenant_id against that setting.
--
-- CRITICAL: the tenant id MUST come from the verified JWT claim, never from a
-- request header, query param or body field. If you ever find code doing
-- set_config from user input, that is a P0 security bug.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Roles
-- -------------------------------------------------------------------------

-- Migration/owner role (runs drizzle-kit). Owns the tables.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'saw_owner') THEN
    CREATE ROLE saw_owner LOGIN PASSWORD 'CHANGE_ME_IN_ENV';
  END IF;
END $$;

-- Application role. Deliberately minimal. NOSUPERUSER, NOBYPASSRLS.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'saw_app') THEN
    CREATE ROLE saw_app LOGIN PASSWORD 'CHANGE_ME_IN_ENV'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

ALTER ROLE saw_app NOBYPASSRLS;

-- Read-only role for analytics / support console.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'saw_readonly') THEN
    CREATE ROLE saw_readonly LOGIN PASSWORD 'CHANGE_ME_IN_ENV' NOSUPERUSER;
  END IF;
END $$;
ALTER ROLE saw_readonly NOBYPASSRLS;

-- -------------------------------------------------------------------------
-- Tenant context helpers
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

-- Platform-support escape hatch. Off by default; setting it is itself audited
-- by the API layer, and every read under it writes a pii_access_log row.
CREATE OR REPLACE FUNCTION app_is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.platform_admin', true), ''), 'false')::boolean;
$$;

-- -------------------------------------------------------------------------
-- Policy generator
--
-- Applies the same policy to every table that has a tenant_id column, so a
-- new table added later CANNOT be forgotten. Re-run this after each migration
-- (the deploy script does it automatically).
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_apply_tenant_rls() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attname = 'tenant_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.table_name);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', r.table_name);

    -- NOTE ON THE `tenant_id IS NULL` CLAUSE — this is load-bearing.
    --
    -- Some tables intentionally allow a NULL tenant_id to mean "global,
    -- shared by every school": the 26 seeded system roles, default
    -- notification templates, default retention policies. A naive policy of
    -- `tenant_id = app_current_tenant()` would filter those rows out
    -- entirely, and every school would silently lose all system roles.
    --
    -- So: USING allows NULL (readable by all), WITH CHECK does NOT. The app
    -- role can therefore READ global rows but can never CREATE one — only
    -- migrations and seeds, which run as saw_owner, can. That asymmetry is
    -- deliberate; do not "simplify" it by making both clauses identical.
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON public.%I
        USING (
          tenant_id IS NULL
          OR tenant_id = app_current_tenant()
          OR app_is_platform_admin()
        )
        WITH CHECK (
          tenant_id = app_current_tenant()
          OR app_is_platform_admin()
        )
    $f$, r.table_name);

    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO saw_app', r.table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO saw_readonly', r.table_name);
  END LOOP;
END $$;

-- -------------------------------------------------------------------------
-- Tables WITHOUT tenant_id — every one is deliberate and justified below.
--
-- ADDING TO THIS LIST REQUIRES A REASON THAT SURVIVES THE QUESTION:
-- "can a school user reach this table?" If yes, it needs tenant_id, full stop.
-- (This is exactly how `referrals` was caught: it looked like control-plane
--  data, but schools view their own referrals in-app, so it got tenant_id.)
--
-- GROUP 1 — identity and pre-tenant flows
--   tenants          : filtered by id, not tenant_id (policy below)
--   users            : global identity; one human, many schools. Authorisation
--                      is via user_tenant_memberships, enforced in the app.
--   sessions         : a session exists before a tenant is selected
--   otp_codes        : OTP is requested before any user or tenant exists
--
-- GROUP 2 — global read-only catalogues (app has SELECT only)
--   permissions      : the 165-permission catalogue
--   plans            : subscription plans
--   consent_purposes : DPDP purpose catalogue
--   role_permissions : nullable tenant_id — NULL rows are the shared system
--                      role bundles. Covered by the generic policy, which
--                      permits NULL on read but not on write.
--
-- GROUP 3 — control plane, platform staff only (NOT reachable by schools)
--   platform_feature_flags  : global flag definitions
--   platform_announcements  : our messages to schools
--   partners                : reseller records
-- -------------------------------------------------------------------------

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self ON public.tenants;
CREATE POLICY tenant_self ON public.tenants
  USING (id = app_current_tenant() OR app_is_platform_admin())
  WITH CHECK (id = app_current_tenant() OR app_is_platform_admin());

-- `users` is intentionally NOT row-filtered: one human can belong to several
-- schools and must be able to log in before a tenant is chosen. Exposure is
-- controlled at the application layer, which only ever returns users reachable
-- through user_tenant_memberships of the active tenant. Any query that selects
-- from `users` without joining memberships is a bug — the CI leak test greps
-- for it.
GRANT SELECT, INSERT, UPDATE ON public.users TO saw_app;
-- tenants has no tenant_id column — grant is not covered by app_apply_tenant_rls().
GRANT SELECT, INSERT, UPDATE ON public.tenants TO saw_app;
GRANT SELECT ON public.tenants TO saw_readonly;
-- Pre-tenant auth tables (sessions / OTP exist before a school is selected).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO saw_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.otp_codes TO saw_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO saw_app;

GRANT SELECT ON public.permissions      TO saw_app, saw_readonly;
GRANT SELECT ON public.plans            TO saw_app, saw_readonly;
GRANT SELECT ON public.consent_purposes TO saw_app, saw_readonly;

-- -------------------------------------------------------------------------
-- Append-only protection for the audit trail
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_block_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit records are append-only';
END $$;

DROP TRIGGER IF EXISTS trg_audit_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION app_block_audit_mutation();

DROP TRIGGER IF EXISTS trg_pii_immutable ON public.pii_access_logs;
CREATE TRIGGER trg_pii_immutable
  BEFORE UPDATE OR DELETE ON public.pii_access_logs
  FOR EACH ROW EXECUTE FUNCTION app_block_audit_mutation();

-- -------------------------------------------------------------------------
-- Defaults for future tables
-- -------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES FOR ROLE saw_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO saw_app;
ALTER DEFAULT PRIVILEGES FOR ROLE saw_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO saw_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE saw_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO saw_app;

GRANT USAGE ON SCHEMA public TO saw_app, saw_readonly;

-- Run it.
SELECT app_apply_tenant_rls();

-- Must run AFTER app_apply_tenant_rls(): that function GRANTs full CRUD on
-- every tenant table, which would undo a REVOKE placed above it.
REVOKE UPDATE, DELETE ON public.audit_logs      FROM saw_app;
REVOKE UPDATE, DELETE ON public.pii_access_logs FROM saw_app;
