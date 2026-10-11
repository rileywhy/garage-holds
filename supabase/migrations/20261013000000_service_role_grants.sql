-- The server's service-role client (src/lib/supabase/admin.ts) records
-- verified uploads. The library migration revoked default grants and only
-- re-granted the user-facing roles, which locked the server out too.

grant all on public.profiles, public.designs, public.design_files, public.reviews, public.bookmarks
  to service_role;
