-- Upload allowances, enforced where ownership already is (RIL-35).
--
-- The server checks an account's usage against its limits before every
-- insert, for the friendly message, but N parallel requests each read the
-- same usage and all pass. These triggers are the backstop. Each one locks
-- the owner's profile row first, so concurrent inserts for one account
-- queue behind each other and the later ones see the earlier rows. They
-- run for the service role too: design_files rows are only ever written by
-- the server. A refusal is a check violation (23514), like the table
-- constraints, so the server can tell it from an outage.

create function public.enforce_design_allowance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed integer;
  used integer;
begin
  select upload_limit_designs into allowed
    from public.profiles where id = new.owner_id for update;
  select count(*) into used
    from public.designs where owner_id = new.owner_id;
  if allowed is not null and used >= allowed then
    raise exception 'upload allowance reached: % of % designs', used, allowed
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger designs_allowance
  before insert on public.designs
  for each row execute function public.enforce_design_allowance();

create function public.enforce_bytes_allowance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
  allowed bigint;
  used bigint;
begin
  select d.owner_id into owner from public.designs d where d.id = new.design_id;
  select upload_limit_bytes into allowed
    from public.profiles where id = owner for update;
  select coalesce(sum(f.bytes), 0) into used
    from public.design_files f
    join public.designs d on d.id = f.design_id
    where d.owner_id = owner;
  if allowed is not null and used + new.bytes > allowed then
    raise exception 'upload allowance reached: % of % bytes', used + new.bytes, allowed
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger design_files_allowance
  before insert on public.design_files
  for each row execute function public.enforce_bytes_allowance();

-- The phone page's per-code photo cap (MAX_SESSION_PHOTOS in
-- src/features/uploads/phone-photos.ts) had the same race.
create function public.enforce_phone_photo_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
begin
  perform 1 from public.phone_sessions where id = new.session_id for update;
  select count(*) into used
    from public.phone_photos where session_id = new.session_id;
  if used >= 12 then
    raise exception 'phone photo cap reached: % per code', used
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger phone_photos_cap
  before insert on public.phone_photos
  for each row execute function public.enforce_phone_photo_cap();

-- Trigger functions are not callable through the API, but the grants are
-- tidied like the other definer functions (20261014000000).
revoke execute on function public.enforce_design_allowance() from public, anon, authenticated;
revoke execute on function public.enforce_bytes_allowance() from public, anon, authenticated;
revoke execute on function public.enforce_phone_photo_cap() from public, anon, authenticated;
