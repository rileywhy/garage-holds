-- Per-account upload allowance. New accounts get the defaults; raise them
-- for people who are clearly uploading real designs:
--
--   update public.profiles
--     set upload_limit_designs = 100, upload_limit_bytes = 10 * 1024 * 1024 * 1024
--     where display_name = 'their name';
--
-- The columns are readable with the rest of the profile but are not in the
-- column list users may update, so only the service role can change them.

alter table public.profiles
  add column upload_limit_designs integer not null default 20
    constraint profiles_upload_limit_designs check (upload_limit_designs >= 0),
  add column upload_limit_bytes bigint not null default 2147483648
    constraint profiles_upload_limit_bytes check (upload_limit_bytes >= 0);
