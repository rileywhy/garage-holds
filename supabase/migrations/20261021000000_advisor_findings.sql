-- Findings from the Supabase security and performance advisors (RIL-39).

-- can_view_design is SECURITY DEFINER, and PostgREST serves every function
-- in the public schema as /rest/v1/rpc/<name>, so anyone could call it to
-- learn whether a draft id exists. The row-level security policies on
-- design_files, reviews and bookmarks evaluate it as the querying role, so
-- anon and authenticated must keep EXECUTE; instead of revoking it, the
-- function moves to a schema the API does not expose. The policies refer to
-- the function by its identity, not its name, so they follow it.
create schema if not exists private;
grant usage on schema private to anon, authenticated;
alter function public.can_view_design(uuid) set schema private;

-- Visitors could read every column of profiles, which since the upload
-- limits landed includes upload_limit_designs, upload_limit_bytes and
-- onboarded_at for every account. Nothing public reads them, but PostgREST
-- would serve them. Signed-out readers now get the public columns only.
-- Signed-in readers keep the full grant: the app reads a person's own
-- limits through their client, and column grants cannot be per row.
revoke select on public.profiles from anon;
grant select (id, display_name, avatar_url, bio, created_at)
  on public.profiles to anon;

-- Foreign keys without a covering index.
create index feedback_author_idx on public.feedback (author_id);
create index phone_sessions_design_idx on public.phone_sessions (design_id);
