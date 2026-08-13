-- Platform invoice PDF status. The PDF is rendered after issue commits;
-- this column tracks pending/ready/failed independently of pdf_path.
-- 0011–0013 were hand-written without snapshots; 0014_snapshot.json is the
-- catch-up so `pnpm db:generate` diffs against current schema. This SQL is
-- only the additive change — do not replay 0011–0013 CREATE TABLEs.

DO $$ BEGIN
  CREATE TYPE "platform_invoice_pdf_status" AS ENUM ('pending', 'ready', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TABLE "platform_invoices"
  ADD COLUMN IF NOT EXISTS "pdf_status" "platform_invoice_pdf_status" NOT NULL DEFAULT 'pending';--> statement-breakpoint

-- Invoices issued before this column existed already have a file on disk.
UPDATE "platform_invoices"
  SET "pdf_status" = 'ready'
  WHERE "pdf_path" IS NOT NULL AND "pdf_status" = 'pending';
