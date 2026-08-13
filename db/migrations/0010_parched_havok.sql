-- Scope-style unique keys where a NULL column means "applies at the wider
-- level" (tenant-wide setting, all-branches membership, platform default
-- retention policy, …). Same failure mode as roles / notification_templates /
-- attendance_registers: under NULLS DISTINCT those rows never collided.
-- Preconditions name the offending keys if any exist so a mid-deploy failure
-- is actionable. Do not resolve duplicates here — which row should win is a
-- product decision for several of these tables.
DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(format('tenant=%s key=%s (%s rows)', tenant_id, key, n), ', ')
    INTO dup
  FROM (
    SELECT tenant_id, key, count(*) AS n FROM tenant_settings
    WHERE branch_id IS NULL GROUP BY tenant_id, key HAVING count(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add NULLS NOT DISTINCT to tenant_settings_scope_key_uq: duplicate tenant-wide settings exist -> %. Decide which value is correct for each (tenant, key) before retrying.', dup;
  END IF;
END $$;--> statement-breakpoint

DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(format('tenant=%s user=%s (%s rows)', tenant_id, user_id, n), ', ')
    INTO dup
  FROM (
    SELECT tenant_id, user_id, count(*) AS n FROM user_tenant_memberships
    WHERE branch_id IS NULL GROUP BY tenant_id, user_id HAVING count(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add NULLS NOT DISTINCT to memberships_tenant_user_branch_uq: duplicate tenant-wide memberships exist -> %. Decide which membership is canonical for each (tenant, user) before retrying.', dup;
  END IF;
END $$;--> statement-breakpoint

DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(format('tenant=%s name=%s (%s rows)', tenant_id, name, n), ', ')
    INTO dup
  FROM (
    SELECT tenant_id, name, count(*) AS n FROM academic_sessions
    WHERE branch_id IS NULL GROUP BY tenant_id, name HAVING count(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add NULLS NOT DISTINCT to academic_sessions_uq: duplicate tenant-wide sessions exist -> %. Decide which session is canonical for each (tenant, name) before retrying.', dup;
  END IF;
END $$;--> statement-breakpoint

DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(
    format('tenant=%s session=%s day=%s (%s rows)', tenant_id, academic_session_id, day, n),
    ', '
  )
    INTO dup
  FROM (
    SELECT tenant_id, academic_session_id, day, count(*) AS n FROM calendar_days
    WHERE branch_id IS NULL
    GROUP BY tenant_id, academic_session_id, day HAVING count(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add NULLS NOT DISTINCT to calendar_days_uq: duplicate tenant-wide calendar days exist -> %. Decide which day-type is correct for each (tenant, session, day) before retrying.', dup;
  END IF;
END $$;--> statement-breakpoint

DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(format('tenant=%s code=%s (%s rows)', tenant_id, code, n), ', ')
    INTO dup
  FROM (
    SELECT tenant_id, code, count(*) AS n FROM leave_types
    WHERE branch_id IS NULL GROUP BY tenant_id, code HAVING count(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add NULLS NOT DISTINCT to leave_types_uq: duplicate tenant-wide leave types exist -> %. Decide which leave type is canonical for each (tenant, code) before retrying.', dup;
  END IF;
END $$;--> statement-breakpoint

DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(
    format('structure=%s head=%s (%s rows)', fee_structure_id, fee_head_id, n),
    ', '
  )
    INTO dup
  FROM (
    SELECT fee_structure_id, fee_head_id, count(*) AS n FROM fee_structure_items
    WHERE term_id IS NULL
    GROUP BY fee_structure_id, fee_head_id HAVING count(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add NULLS NOT DISTINCT to fsi_uq: duplicate all-terms fee items exist -> %. Decide which amount is correct for each (structure, head) before retrying.', dup;
  END IF;
END $$;--> statement-breakpoint

DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(
    format('branch=%s session=%s version=%s (%s rows)', branch_id, academic_session_id, version, n),
    ', '
  )
    INTO dup
  FROM (
    SELECT branch_id, academic_session_id, version, count(*) AS n FROM fee_structures
    WHERE class_id IS NULL
    GROUP BY branch_id, academic_session_id, version HAVING count(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add NULLS NOT DISTINCT to fee_structures_uq: duplicate branch-wide fee structures exist -> %. Decide which structure is canonical for each (branch, session, version) before retrying.', dup;
  END IF;
END $$;--> statement-breakpoint

DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(
    format('book=%s section=%s session=%s (%s rows)', book_id, section_id, academic_session_id, n),
    ', '
  )
    INTO dup
  FROM (
    SELECT book_id, section_id, academic_session_id, count(*) AS n FROM book_audiences
    WHERE class_id IS NULL
    GROUP BY book_id, section_id, academic_session_id HAVING count(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add NULLS NOT DISTINCT to book_audiences_uq: duplicate all-classes audience rows exist -> %. Decide which audience row is canonical for each (book, section, session) before retrying.', dup;
  END IF;
END $$;--> statement-breakpoint

DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(format('entity_type=%s (%s rows)', entity_type, n), ', ')
    INTO dup
  FROM (
    SELECT entity_type, count(*) AS n FROM retention_policies
    WHERE tenant_id IS NULL GROUP BY entity_type HAVING count(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add NULLS NOT DISTINCT to retention_policies_uq: duplicate platform default policies exist -> %. Decide which retention/action is correct for each entity_type before retrying.', dup;
  END IF;
END $$;--> statement-breakpoint

DROP INDEX IF EXISTS "tenant_settings_scope_key_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "memberships_tenant_user_branch_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "academic_sessions_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "calendar_days_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "leave_types_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "fsi_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "fee_structures_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "book_audiences_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "retention_policies_uq";--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_scope_key_uq" UNIQUE NULLS NOT DISTINCT("tenant_id","branch_id","key");--> statement-breakpoint
ALTER TABLE "user_tenant_memberships" ADD CONSTRAINT "memberships_tenant_user_branch_uq" UNIQUE NULLS NOT DISTINCT("tenant_id","user_id","branch_id");--> statement-breakpoint
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_uq" UNIQUE NULLS NOT DISTINCT("tenant_id","branch_id","name");--> statement-breakpoint
ALTER TABLE "calendar_days" ADD CONSTRAINT "calendar_days_uq" UNIQUE NULLS NOT DISTINCT("tenant_id","branch_id","academic_session_id","day");--> statement-breakpoint
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_uq" UNIQUE NULLS NOT DISTINCT("tenant_id","branch_id","code");--> statement-breakpoint
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fsi_uq" UNIQUE NULLS NOT DISTINCT("fee_structure_id","fee_head_id","term_id");--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_uq" UNIQUE NULLS NOT DISTINCT("branch_id","academic_session_id","class_id","version");--> statement-breakpoint
ALTER TABLE "book_audiences" ADD CONSTRAINT "book_audiences_uq" UNIQUE NULLS NOT DISTINCT("book_id","class_id","section_id","academic_session_id");--> statement-breakpoint
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_uq" UNIQUE NULLS NOT DISTINCT("tenant_id","entity_type");
