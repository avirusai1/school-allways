-- Attendance domain: period_id / term_id NULL means "whole day / whole session".
-- Under NULLS DISTINCT those rows never collided, so a section could hold two
-- day-level registers for the same day — the same "was this actually marked?"
-- ambiguity the design notes call out, one level up. Preconditions name the
-- offending keys if any exist so a mid-deploy failure is actionable rather
-- than a generic "could not create unique index".
DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(
    format('section=%s day=%s (%s rows)', section_id, day, n),
    ', '
  )
    INTO dup
  FROM (
    SELECT section_id, day, count(*) AS n
    FROM attendance_registers
    WHERE period_id IS NULL
    GROUP BY section_id, day
    HAVING count(*) > 1
  ) d;

  IF dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add NULLS NOT DISTINCT to att_register_uq: duplicate day-level registers exist -> %. Resolve which register is canonical for each (section, day) before retrying this migration.', dup;
  END IF;
END $$;--> statement-breakpoint

DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(
    format('student=%s session=%s (%s rows)', student_id, academic_session_id, n),
    ', '
  )
    INTO dup
  FROM (
    SELECT student_id, academic_session_id, count(*) AS n
    FROM attendance_summaries
    WHERE term_id IS NULL
    GROUP BY student_id, academic_session_id
    HAVING count(*) > 1
  ) d;

  IF dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add NULLS NOT DISTINCT to att_summary_uq: duplicate session-level summaries exist -> %. Resolve which summary is canonical for each (student, session) before retrying this migration.', dup;
  END IF;
END $$;--> statement-breakpoint

DROP INDEX IF EXISTS "att_register_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "att_summary_uq";--> statement-breakpoint
ALTER TABLE "attendance_registers" ADD CONSTRAINT "att_register_uq" UNIQUE NULLS NOT DISTINCT("section_id","day","period_id");--> statement-breakpoint
ALTER TABLE "attendance_summaries" ADD CONSTRAINT "att_summary_uq" UNIQUE NULLS NOT DISTINCT("student_id","academic_session_id","term_id");
