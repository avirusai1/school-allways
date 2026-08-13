-- Bootstrap roles + stubs required BEFORE drizzle migrations that GRANT to saw_app
-- or call app_apply_tenant_rls(). Safe to re-run.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'saw_app') THEN
    CREATE ROLE saw_app LOGIN PASSWORD 'CHANGE_ME_IN_ENV'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

ALTER ROLE saw_app NOBYPASSRLS;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'saw_readonly') THEN
    CREATE ROLE saw_readonly LOGIN PASSWORD 'CHANGE_ME_IN_ENV' NOSUPERUSER;
  END IF;
END $$;

ALTER ROLE saw_readonly NOBYPASSRLS;

-- Stub until 002_rls.sql replaces with the real implementation.
CREATE OR REPLACE FUNCTION app_apply_tenant_rls() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  -- no-op until full RLS script is applied after migrations
  RETURN;
END $$;
