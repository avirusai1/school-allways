-- Preconditions. ADD CONSTRAINT would fail on its own if duplicates existed,
-- but with a generic "could not create unique index" that names neither the
-- table's purpose nor which key collided. These blocks say what is wrong and
-- what to run to fix it, because whoever hits this will be mid-deploy.
DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(format('%s (tenant_id is null, %s rows)', code, n), ', ')
    INTO dup
  FROM (
    SELECT code, count(*) AS n
    FROM roles
    WHERE tenant_id IS NULL
    GROUP BY code
    HAVING count(*) > 1
  ) d;

  IF dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add NULLS NOT DISTINCT to roles_tenant_code_uq: duplicate system roles exist -> %. Re-run `pnpm db:seed`, which collapses copies onto the oldest row, then retry this migration.', dup;
  END IF;
END $$;--> statement-breakpoint

DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(format('%s/%s/%s (%s rows)', code, channel, language, n), ', ')
    INTO dup
  FROM (
    SELECT code, channel, language, count(*) AS n
    FROM notification_templates
    WHERE tenant_id IS NULL
    GROUP BY code, channel, language
    HAVING count(*) > 1
  ) d;

  IF dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add NULLS NOT DISTINCT to notif_templates_uq: duplicate system templates exist -> %. Re-run `pnpm db:seed`, which collapses copies onto the oldest row, then retry this migration.', dup;
  END IF;
END $$;--> statement-breakpoint

DROP INDEX IF EXISTS "roles_tenant_code_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "notif_templates_uq";--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_code_uq" UNIQUE NULLS NOT DISTINCT("tenant_id","code");--> statement-breakpoint
ALTER TABLE "notification_templates" ADD CONSTRAINT "notif_templates_uq" UNIQUE NULLS NOT DISTINCT("tenant_id","code","channel","language");
