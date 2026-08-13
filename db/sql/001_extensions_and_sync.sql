-- =========================================================================
-- Extensions, the global row_version sequence, and sync triggers.
-- Run BEFORE 002_rls.sql.
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- fast student/staff name search
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- -------------------------------------------------------------------------
-- Global row_version sequence
--
-- ONE sequence for the whole database, not one per table. That gives a single
-- monotonic clock the client can use as a cursor across every entity, so a
-- "sync everything" pass is `WHERE row_version > $cursor` on each table with
-- the same number. Per-table sequences would force the client to track N
-- cursors and would make ordering across entities ambiguous.
-- -------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS global_row_version START 1;
GRANT USAGE, SELECT ON SEQUENCE global_row_version TO saw_app;

-- Idempotent catch-up: any sequence saw_app may nextval() through sync triggers
-- or tombstones must have USAGE+SELECT. Explicit grant above documents the one
-- we know about; this loop covers sequences added by later migrations.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT sequence_schema, sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format(
      'GRANT USAGE, SELECT ON SEQUENCE %I.%I TO saw_app',
      r.sequence_schema, r.sequence_name
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION app_bump_row_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.row_version := nextval('global_row_version');
  NEW.updated_at  := now();
  RETURN NEW;
END $$;

-- Attach to every table that has a row_version column.
CREATE OR REPLACE FUNCTION app_attach_sync_triggers() RETURNS void
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
      AND a.attname = 'row_version'
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_bump_row_version ON public.%I', r.table_name);
    EXECUTE format($f$
      CREATE TRIGGER trg_bump_row_version
        BEFORE INSERT OR UPDATE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION app_bump_row_version()
    $f$, r.table_name);

    -- The delta-sync index. Without this, every sync is a seq scan and the
    -- 2-core box falls over at about 15 schools.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id, row_version)',
      r.table_name || '_tenant_rowver_idx', r.table_name);
  END LOOP;
END $$;

-- -------------------------------------------------------------------------
-- Tombstones on delete, so clients can remove locally-cached rows.
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_write_tombstone() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.sync_tombstones (id, tenant_id, entity_type, entity_id, row_version, deleted_at)
  VALUES (gen_random_uuid(), OLD.tenant_id, TG_TABLE_NAME, OLD.id,
          nextval('global_row_version'), now());
  RETURN OLD;
END $$;

-- -------------------------------------------------------------------------
-- Invoice balance as a generated column (fees C1–C4).
-- Keeping this in the database means the defaulter list can never disagree
-- with the invoice detail because some code path forgot to recompute.
-- -------------------------------------------------------------------------

-- Applied in a follow-up migration once the invoices table exists:
--   ALTER TABLE invoices
--     DROP COLUMN balance_paise,
--     ADD COLUMN balance_paise bigint
--       GENERATED ALWAYS AS (net_amount_paise - paid_amount_paise) STORED;

-- -------------------------------------------------------------------------
-- Search indexes
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS students_name_trgm_idx
  ON public.students USING gin ((first_name || ' ' || COALESCE(last_name,'')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS staff_name_trgm_idx
  ON public.staff USING gin ((first_name || ' ' || COALESCE(last_name,'')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS books_title_trgm_idx
  ON public.books USING gin (title gin_trgm_ops);

SELECT app_attach_sync_triggers();
