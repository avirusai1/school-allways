-- Public signup: the one write that has to happen before a tenant exists.
--
-- A stranger filling in the signup form has no session and no school, so the
-- row recording their interest is created with `tenant_id IS NULL` and claimed
-- later, once the OTP is verified and the tenant is provisioned.
--
-- The generic `tenant_isolation` policy in 002_rls.sql reads NULL rows but
-- deliberately refuses to write them — that asymmetry is what stops the app
-- role from minting global system roles or notification templates, and it must
-- not be relaxed for every table just to let this one through. So, as with
-- 004_join_token_lookup.sql, the exception is narrow, named, and lives here.
--
-- Policies are permissive and OR together, so this adds one capability to one
-- table: insert a signup that belongs to nobody yet.
--
-- What it does not add:
--   * No SELECT — reading unclaimed signups is already permitted by
--     tenant_isolation's USING clause and is unchanged by this file.
--   * No UPDATE — claiming a signup happens under asTenant() once the tenant
--     exists, where the ordinary policy applies in full.
--   * Nothing for any other table.
--
-- Abuse of the insert is bounded where it actually matters: the row is inert
-- until an OTP is verified, and OTP requests are rate limited per phone and
-- per IP.

DROP POLICY IF EXISTS signup_intake ON public.tenant_signups;
CREATE POLICY signup_intake ON public.tenant_signups
  FOR INSERT
  WITH CHECK (tenant_id IS NULL);
