CREATE TABLE IF NOT EXISTS "join_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"token_hash" varchar(64) NOT NULL,
	"purpose" varchar(30) NOT NULL,
	"student_id" uuid,
	"user_id" uuid,
	"phone" varchar(15),
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_callbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"preferred_time" varchar(100),
	"note" text,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_nudges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"step" varchar(50) NOT NULL,
	"day_offset" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"channel" varchar(20) DEFAULT 'whatsapp' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_name" varchar(200) NOT NULL,
	"board" varchar(20) DEFAULT 'cbse' NOT NULL,
	"city" varchar(100) NOT NULL,
	"state" varchar(100) NOT NULL,
	"approx_student_count" integer,
	"contact_name" varchar(150) NOT NULL,
	"contact_phone" varchar(15) NOT NULL,
	"contact_email" varchar(254),
	"referral_code" varchar(20),
	"tenant_id" uuid,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "guardians" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "join_tokens" ADD CONSTRAINT "join_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "join_tokens" ADD CONSTRAINT "join_tokens_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "join_tokens" ADD CONSTRAINT "join_tokens_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "join_tokens" ADD CONSTRAINT "join_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_callbacks" ADD CONSTRAINT "onboarding_callbacks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_callbacks" ADD CONSTRAINT "onboarding_callbacks_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_nudges" ADD CONSTRAINT "onboarding_nudges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_signups" ADD CONSTRAINT "tenant_signups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "join_tokens_hash_uq" ON "join_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "join_tokens_tenant_idx" ON "join_tokens" USING btree ("tenant_id","purpose");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_callbacks_tenant_idx" ON "onboarding_callbacks" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_nudges_uq" ON "onboarding_nudges" USING btree ("tenant_id","step","day_offset");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_nudges_tenant_idx" ON "onboarding_nudges" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_signups_phone_idx" ON "tenant_signups" USING btree ("contact_phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_signups_expiry_idx" ON "tenant_signups" USING btree ("expires_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guardians" ADD CONSTRAINT "guardians_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff" ADD CONSTRAINT "staff_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guardians_import_batch_idx" ON "guardians" USING btree ("import_batch_id") WHERE "guardians"."import_batch_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_enrollments_import_batch_idx" ON "student_enrollments" USING btree ("import_batch_id") WHERE "student_enrollments"."import_batch_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_guardians_import_batch_idx" ON "student_guardians" USING btree ("import_batch_id") WHERE "student_guardians"."import_batch_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_import_batch_idx" ON "students" USING btree ("import_batch_id") WHERE "students"."import_batch_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_import_batch_idx" ON "staff" USING btree ("import_batch_id") WHERE "staff"."import_batch_id" is not null;