-- Auth-time visibility: before a tenant is selected, login must still be able
-- to list the caller's memberships and the matching tenant/branch names.
--
-- `app.acting_user_id` is set ONLY by TenantDbService.runAsActingUser() after
-- the user has been authenticated (password verified / OTP consumed). It is
-- never taken from a request header.

CREATE OR REPLACE FUNCTION app_acting_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.acting_user_id', true), '')::uuid;
$$;

DROP POLICY IF EXISTS membership_acting_user ON public.user_tenant_memberships;
CREATE POLICY membership_acting_user ON public.user_tenant_memberships
  FOR SELECT
  USING (user_id = app_acting_user());

DROP POLICY IF EXISTS tenant_acting_user ON public.tenants;
CREATE POLICY tenant_acting_user ON public.tenants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_tenant_memberships m
      WHERE m.tenant_id = tenants.id
        AND m.user_id = app_acting_user()
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS branch_acting_user ON public.branches;
CREATE POLICY branch_acting_user ON public.branches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_tenant_memberships m
      WHERE m.tenant_id = branches.tenant_id
        AND m.user_id = app_acting_user()
        AND m.status = 'active'
        AND (m.branch_id IS NULL OR m.branch_id = branches.id)
    )
  );
