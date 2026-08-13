CREATE TYPE "public"."flag_kind" AS ENUM('boolean', 'percentage', 'allowlist', 'config');--> statement-breakpoint
CREATE TYPE "public"."health_band" AS ENUM('not_started', 'onboarding', 'activated', 'healthy', 'at_risk', 'churning', 'dormant');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"step" varchar(50) NOT NULL,
	"action" varchar(20) NOT NULL,
	"duration_seconds" integer,
	"item_count" integer,
	"error_count" integer,
	"error_class" varchar(80),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partner_tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"attributed_at" timestamp with time zone DEFAULT now(),
	"commission_bp" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"contact_name" varchar(150),
	"contact_phone" varchar(15),
	"contact_email" varchar(254),
	"city" varchar(100),
	"state" varchar(100),
	"commission_bp" integer DEFAULT 0 NOT NULL,
	"referral_code" varchar(20) NOT NULL,
	"can_view_school_metrics" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"kind" varchar(30) DEFAULT 'release' NOT NULL,
	"target_plan_codes" jsonb DEFAULT '[]'::jsonb,
	"target_health_bands" jsonb DEFAULT '[]'::jsonb,
	"target_tenant_ids" jsonb DEFAULT '[]'::jsonb,
	"show_from" timestamp with time zone,
	"show_until" timestamp with time zone,
	"is_blocking" boolean DEFAULT false NOT NULL,
	"cta_label" varchar(60),
	"cta_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(80) NOT NULL,
	"name" varchar(150) NOT NULL,
	"description" text,
	"module_code" varchar(10),
	"kind" "flag_kind" DEFAULT 'boolean' NOT NULL,
	"default_value" jsonb DEFAULT 'false'::jsonb NOT NULL,
	"rollout_percentage" smallint DEFAULT 0,
	"is_kill_switched" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_support_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_user_id" uuid NOT NULL,
	"impersonated_user_id" uuid,
	"reason" text NOT NULL,
	"ticket_ref" varchar(60),
	"access_level" varchar(20) DEFAULT 'read_only' NOT NULL,
	"approved_by_supervisor_id" uuid,
	"requires_school_approval" boolean DEFAULT false NOT NULL,
	"school_approved_by_user_id" uuid,
	"school_approved_at" timestamp with time zone,
	"school_notified_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"action_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_tenant_id" uuid NOT NULL,
	"referrer_user_id" uuid,
	"code" varchar(20) NOT NULL,
	"referred_tenant_id" uuid,
	"invited_school_name" varchar(200),
	"invited_contact_phone" varchar(15),
	"status" varchar(20) DEFAULT 'sent' NOT NULL,
	"signed_up_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"reward_months" smallint DEFAULT 0,
	"reward_granted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_feature_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"flag_id" uuid NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"reason" text,
	"set_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"band" "health_band" DEFAULT 'not_started' NOT NULL,
	"score" smallint DEFAULT 0 NOT NULL,
	"activation_score" smallint DEFAULT 0 NOT NULL,
	"engagement_score" smallint DEFAULT 0 NOT NULL,
	"adoption_score" smallint DEFAULT 0 NOT NULL,
	"days_since_last_attendance" integer,
	"days_since_any_activity" integer,
	"risk_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snoozed_until" timestamp with time zone,
	"owner_user_id" uuid,
	"computed_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_metrics_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"branch_count" integer DEFAULT 0 NOT NULL,
	"student_count" integer DEFAULT 0 NOT NULL,
	"staff_count" integer DEFAULT 0 NOT NULL,
	"guardian_count" integer DEFAULT 0 NOT NULL,
	"active_class_count" integer DEFAULT 0 NOT NULL,
	"dau_staff" integer DEFAULT 0 NOT NULL,
	"dau_parents" integer DEFAULT 0 NOT NULL,
	"mau_staff" integer DEFAULT 0 NOT NULL,
	"mau_parents" integer DEFAULT 0 NOT NULL,
	"parent_activation_bp" integer DEFAULT 0 NOT NULL,
	"attendance_registers_marked" integer DEFAULT 0 NOT NULL,
	"attendance_registers_expected" integer DEFAULT 0 NOT NULL,
	"homework_posted" integer DEFAULT 0 NOT NULL,
	"announcements_sent" integer DEFAULT 0 NOT NULL,
	"messages_sent" integer DEFAULT 0 NOT NULL,
	"marks_entered" integer DEFAULT 0 NOT NULL,
	"report_cards_published" integer DEFAULT 0 NOT NULL,
	"books_opened" integer DEFAULT 0 NOT NULL,
	"trips_run" integer DEFAULT 0 NOT NULL,
	"invoices_raised" integer DEFAULT 0 NOT NULL,
	"fees_collected_paise" bigint DEFAULT 0 NOT NULL,
	"fees_outstanding_paise" bigint DEFAULT 0 NOT NULL,
	"online_payment_count" integer DEFAULT 0 NOT NULL,
	"sms_sent" integer DEFAULT 0 NOT NULL,
	"sms_cost_paise" bigint DEFAULT 0 NOT NULL,
	"whatsapp_sent" integer DEFAULT 0 NOT NULL,
	"push_sent" integer DEFAULT 0 NOT NULL,
	"storage_bytes" bigint DEFAULT 0 NOT NULL,
	"api_requests" integer DEFAULT 0 NOT NULL,
	"egress_bytes" bigint DEFAULT 0 NOT NULL,
	"apaar_generated" integer DEFAULT 0 NOT NULL,
	"apaar_pending" integer DEFAULT 0 NOT NULL,
	"consent_pending" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "onboarding_events" ADD CONSTRAINT "onboarding_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "partner_tenants" ADD CONSTRAINT "partner_tenants_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "partner_tenants" ADD CONSTRAINT "partner_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_support_sessions" ADD CONSTRAINT "platform_support_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_support_sessions" ADD CONSTRAINT "platform_support_sessions_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_support_sessions" ADD CONSTRAINT "platform_support_sessions_impersonated_user_id_users_id_fk" FOREIGN KEY ("impersonated_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_support_sessions" ADD CONSTRAINT "platform_support_sessions_approved_by_supervisor_id_users_id_fk" FOREIGN KEY ("approved_by_supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_support_sessions" ADD CONSTRAINT "platform_support_sessions_school_approved_by_user_id_users_id_fk" FOREIGN KEY ("school_approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_tenant_id_tenants_id_fk" FOREIGN KEY ("referrer_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_tenant_id_tenants_id_fk" FOREIGN KEY ("referred_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_feature_overrides" ADD CONSTRAINT "tenant_feature_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_feature_overrides" ADD CONSTRAINT "tenant_feature_overrides_flag_id_platform_feature_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."platform_feature_flags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_feature_overrides" ADD CONSTRAINT "tenant_feature_overrides_set_by_user_id_users_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_health" ADD CONSTRAINT "tenant_health_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_health" ADD CONSTRAINT "tenant_health_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_metrics_daily" ADD CONSTRAINT "tenant_metrics_daily_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_events_tenant_idx" ON "onboarding_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_events_step_idx" ON "onboarding_events" USING btree ("step","action");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "partner_tenants_uq" ON "partner_tenants" USING btree ("partner_id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "partners_code_uq" ON "partners" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_announcements_window_idx" ON "platform_announcements" USING btree ("show_from","show_until");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_flags_key_uq" ON "platform_feature_flags" USING btree ("key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_flags_module_idx" ON "platform_feature_flags" USING btree ("module_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_sessions_tenant_idx" ON "platform_support_sessions" USING btree ("tenant_id","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_sessions_agent_idx" ON "platform_support_sessions" USING btree ("agent_user_id","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_sessions_active_idx" ON "platform_support_sessions" USING btree ("expires_at","ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "referrals_code_uq" ON "referrals" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referrals_referrer_idx" ON "referrals" USING btree ("referrer_tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referrals_status_idx" ON "referrals" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_flag_overrides_uq" ON "tenant_feature_overrides" USING btree ("tenant_id","flag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_flag_overrides_tenant_idx" ON "tenant_feature_overrides" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_flag_overrides_expiry_idx" ON "tenant_feature_overrides" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_health_tenant_uq" ON "tenant_health" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_health_band_idx" ON "tenant_health" USING btree ("band","score");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_metrics_daily_uq" ON "tenant_metrics_daily" USING btree ("tenant_id","day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_metrics_daily_day_idx" ON "tenant_metrics_daily" USING btree ("day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_metrics_daily_tenant_day_idx" ON "tenant_metrics_daily" USING btree ("tenant_id","day");