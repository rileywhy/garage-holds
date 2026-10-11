-- Postgres grants EXECUTE on new functions to PUBLIC, so both SECURITY
-- DEFINER functions were callable through the REST API (/rest/v1/rpc/...),
-- which the Supabase security advisor flags.
--
-- handle_new_user only ever runs as the auth.users insert trigger; nothing
-- should call it directly. The auth server inserts as supabase_auth_admin,
-- which still needs EXECUTE for the trigger to fire.
--
-- can_view_design stays executable: row-level security evaluates policy
-- expressions as the querying role, so anon and authenticated must be able
-- to run it. Calling it directly only answers what the policies already
-- answer, and the advisor warning for it is accepted.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;
