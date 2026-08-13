-- Join-link activation: the one read that has to happen before a tenant is known.
--
-- A parent tapping their invitation link has no session and no tenant, so the
-- API cannot set `app.tenant_id` before looking the token up — and `join_tokens`
-- is tenant-scoped, so under the standard policy the lookup returns zero rows.
--
-- The same problem as login listing memberships, solved the same way as
-- 003_auth_acting_user.sql: a narrow, purpose-built policy keyed on a setting
-- only the API can set.
--
-- What makes this safe is what the setting holds. `app.join_token_hash` is the
-- SHA-256 of the token the caller just presented, so the policy exposes exactly
-- the single row whose secret the caller already knows. It is not a tenant-wide
-- read and it cannot be used to enumerate: without the token you cannot compute
-- the hash, and with the token you are already entitled to that row.
--
-- SELECT only. Consuming the token and flipping the membership happen under
-- asTenant() once the row has told us which tenant we are in.

CREATE OR REPLACE FUNCTION app_join_token_hash() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.join_token_hash', true), '');
$$;

DROP POLICY IF EXISTS join_token_lookup ON public.join_tokens;
CREATE POLICY join_token_lookup ON public.join_tokens
  FOR SELECT
  USING (token_hash = app_join_token_hash());
