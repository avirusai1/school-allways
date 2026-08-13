-- ---------------------------------------------------------------------------
-- Control-plane tables: grants the app role was never given.
--
-- `app_apply_tenant_rls()` walks tables that HAVE a `tenant_id` and grants
-- saw_app as it goes. These three deliberately have none — they are described
-- in 002_rls.sql as "control plane, platform staff only" — so the loop skips
-- them, and nothing else ever granted them. The API runs as saw_app, so every
-- query against them failed with `permission denied`.
--
-- Two things were broken by that, both silently:
--
--   1. The console's Flags page returned a 500. Nobody noticed, because until
--      now nobody could log into the console.
--   2. Worse: `resolveForTenant()` reads platform_feature_flags on EVERY school
--      login, and `buildSession` wraps it in `.catch(() => ({}))`. So feature
--      flags have never resolved for any school — every session got an empty
--      flag set and looked perfectly healthy doing it.
--
-- Grants alone would open these to any school request, so each gets an RLS
-- policy in the same breath.
-- ---------------------------------------------------------------------------

-- Flag definitions are a global catalogue, like `plans`: every tenant session
-- reads them to resolve its own feature set. Writes are the console's alone.
-- No DELETE grant — a DELETE policy can only filter with USING, so there would
-- be nothing left to gate the write on. Flags are retired with is_active.
ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_feature_flags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flags_readable_writes_platform_only ON public.platform_feature_flags;
CREATE POLICY flags_readable_writes_platform_only ON public.platform_feature_flags
  USING (true)
  WITH CHECK (app_is_platform_admin());

GRANT SELECT, INSERT, UPDATE ON public.platform_feature_flags TO saw_app;
GRANT SELECT ON public.platform_feature_flags TO saw_readonly;

-- Our messages to schools, and reseller records. Neither is read by any tenant
-- route — both are reached only through PlatformController, which is
-- @PlatformOnly — so the policy matches: platform admin or nothing.
ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_announcements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS announcements_platform_only ON public.platform_announcements;
CREATE POLICY announcements_platform_only ON public.platform_announcements
  USING (app_is_platform_admin())
  WITH CHECK (app_is_platform_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_announcements TO saw_app;

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partners_platform_only ON public.partners;
CREATE POLICY partners_platform_only ON public.partners
  USING (app_is_platform_admin())
  WITH CHECK (app_is_platform_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partners TO saw_app;
