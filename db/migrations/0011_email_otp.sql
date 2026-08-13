-- Email OTP: phone is no longer the only addressable handle on otp_codes.
-- Email becomes the funded delivery channel; phone stays nullable for rows
-- keyed only by email (and for future email-only manual accounts).
ALTER TABLE "otp_codes" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD COLUMN IF NOT EXISTS "email" varchar(254);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "otp_email_purpose_idx" ON "otp_codes" USING btree ("email","purpose");--> statement-breakpoint
ALTER TABLE "otp_codes" DROP CONSTRAINT IF EXISTS "otp_codes_contact_chk";--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_contact_chk"
  CHECK ("phone" IS NOT NULL OR "email" IS NOT NULL);
