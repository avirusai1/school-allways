-- Parent-paid subscriptions, Stay Connected Fee, B2B platform invoices.
-- Preconditions name duplicates if any exist so a mid-deploy failure is actionable.

DO $$
DECLARE dup text;
BEGIN
  SELECT string_agg(format('student=%s session=%s (%s rows)', student_id, academic_session_id, n), ', ')
    INTO dup
  FROM (
    SELECT student_id, academic_session_id, count(*) AS n
    FROM student_subscriptions
    GROUP BY student_id, academic_session_id
    HAVING count(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add student_subscriptions_student_session_uq: duplicates exist -> %. Decide which row is canonical before retrying.', dup;
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL; -- table is created below
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "student_subscription_status" AS ENUM ('active', 'expired', 'refunded', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "student_subscription_source" AS ENUM ('google_play', 'manual_cash', 'complimentary');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "stay_connected_fee_status" AS ENUM ('pending', 'paid', 'waived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "platform_invoice_status" AS ENUM ('issued', 'void');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "student_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE cascade,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE cascade,
  "academic_session_id" uuid NOT NULL REFERENCES "academic_sessions"("id") ON DELETE cascade,
  "status" "student_subscription_status" NOT NULL,
  "total_paise" integer NOT NULL,
  "base_paise" integer NOT NULL,
  "gst_paise" integer NOT NULL,
  "source" "student_subscription_source" NOT NULL,
  "play_purchase_token" text,
  "play_order_id" varchar(100),
  "activated_by_user_id" uuid REFERENCES "users"("id"),
  "activated_at" timestamptz NOT NULL,
  "notes" varchar(300),
  "billed_to_school_at" timestamptz,
  "platform_invoice_id" uuid,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz,
  "created_by" uuid,
  "updated_by" uuid,
  "row_version" bigint DEFAULT 0 NOT NULL
);--> statement-breakpoint

ALTER TABLE "student_subscriptions" DROP CONSTRAINT IF EXISTS "student_subscriptions_student_session_uq";--> statement-breakpoint
ALTER TABLE "student_subscriptions" ADD CONSTRAINT "student_subscriptions_student_session_uq" UNIQUE NULLS NOT DISTINCT ("student_id", "academic_session_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "student_subscriptions_tenant_session_status_idx"
  ON "student_subscriptions" ("tenant_id", "academic_session_id", "status");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "student_subscriptions_unbilled_manual_idx"
  ON "student_subscriptions" ("tenant_id")
  WHERE "source" = 'manual_cash' AND "billed_to_school_at" IS NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "student_subscriptions_play_token_uq"
  ON "student_subscriptions" ("play_purchase_token")
  WHERE "play_purchase_token" IS NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "stay_connected_fees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "academic_session_id" uuid NOT NULL REFERENCES "academic_sessions"("id") ON DELETE cascade,
  "base_paise" integer NOT NULL,
  "gst_paise" integer NOT NULL,
  "total_paise" integer NOT NULL,
  "status" "stay_connected_fee_status" NOT NULL DEFAULT 'pending',
  "due_date" timestamptz NOT NULL,
  "paid_at" timestamptz,
  "invoice_number" varchar(40),
  "platform_invoice_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz,
  "created_by" uuid,
  "updated_by" uuid
);--> statement-breakpoint

ALTER TABLE "stay_connected_fees" DROP CONSTRAINT IF EXISTS "stay_connected_fees_tenant_session_uq";--> statement-breakpoint
ALTER TABLE "stay_connected_fees" ADD CONSTRAINT "stay_connected_fees_tenant_session_uq" UNIQUE ("tenant_id", "academic_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stay_connected_fees_tenant_status_idx"
  ON "stay_connected_fees" ("tenant_id", "status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "invoice_number" varchar(40) NOT NULL,
  "financial_year" varchar(9) NOT NULL,
  "kind" varchar(40) NOT NULL,
  "line_items" jsonb NOT NULL,
  "base_paise" integer NOT NULL,
  "cgst_paise" integer NOT NULL DEFAULT 0,
  "sgst_paise" integer NOT NULL DEFAULT 0,
  "igst_paise" integer NOT NULL DEFAULT 0,
  "total_paise" integer NOT NULL,
  "sac_code" varchar(10) NOT NULL,
  "place_of_supply" varchar(100) NOT NULL,
  "pdf_path" text,
  "issued_at" timestamptz NOT NULL,
  "status" "platform_invoice_status" NOT NULL DEFAULT 'issued',
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz,
  "created_by" uuid,
  "updated_by" uuid
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "platform_invoices_number_uq" ON "platform_invoices" ("invoice_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_invoices_tenant_idx" ON "platform_invoices" ("tenant_id", "issued_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_invoice_counters" (
  "financial_year" varchar(9) PRIMARY KEY NOT NULL,
  "last_number" integer NOT NULL
);--> statement-breakpoint

-- RLS + grants for platform_invoice_counters moved to db/sql/006_platform_grants.sql
-- (2026-08-13). A migration runs during `pnpm db:migrate`, BEFORE 001-006 SQL —
-- so app_is_platform_admin()/app_apply_tenant_rls() do not exist yet on a fresh
-- database. This only worked on machines where those functions already existed
-- from an earlier local-up.sh run. Every other table's RLS lives in the 00x
-- scripts; this one should too, and now does.
