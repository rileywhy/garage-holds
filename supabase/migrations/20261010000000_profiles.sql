-- Accounts: one public profile per authenticated user.
-- The immutable user id (auth.users.id) is the ownership key everywhere;
-- display_name is an editable, unique label.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length
    check (char_length(display_name) between 2 and 50),
  constraint profiles_display_name_trimmed
    check (display_name = btrim(display_name))
);

-- Case-insensitive uniqueness so "Riley" and "riley" cannot both exist.
create unique index profiles_display_name_key
  on public.profiles (lower(display_name));

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Creates the profile when Supabase Auth creates the user. Google supplies
-- full_name and avatar_url in raw_user_meta_data; email-code users get the
-- part of their address before the @. Collisions get a numeric suffix.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
  attempt integer := 0;
begin
  base := nullif(
    btrim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )),
    ''
  );
  if base is null then
    base := split_part(coalesce(new.email, ''), '@', 1);
  end if;
  base := left(regexp_replace(base, '\s+', ' ', 'g'), 50);
  if char_length(base) < 2 then
    base := 'maker';
  end if;

  candidate := base;
  while exists (
    select 1 from public.profiles where lower(display_name) = lower(candidate)
  ) loop
    attempt := attempt + 1;
    candidate := left(base, 50 - char_length(attempt::text) - 1)
      || '-' || attempt::text;
  end loop;

  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    candidate,
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

-- Explicit grants instead of Supabase's defaults. Inserts happen only through
-- the signup trigger, and only display_name and avatar_url are editable.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

create policy "Profiles are public"
  on public.profiles for select
  using (true);

create policy "Users update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
