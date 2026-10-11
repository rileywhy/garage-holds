-- Photos handed over from a phone. The upload page shows a QR code that
-- opens /phone/<session id> on the phone; the phone uploads photos into the
-- session without signing in, since the unguessable id is the proof, and
-- the desktop picks them up when it submits the design (or, from the edit
-- page, attaches them to a design that already exists).

create table public.phone_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  design_id uuid references public.designs (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);

-- Written only by the server after the object has been verified in R2,
-- like design_files. Objects live under inbox/<session id>/ until attached.
create table public.phone_photos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.phone_sessions (id) on delete cascade,
  object_key text not null unique,
  name text not null,
  extension text not null,
  bytes bigint not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint phone_photos_name_length check (char_length(name) between 1 and 255),
  constraint phone_photos_bytes check (bytes between 1 and 10485760),
  constraint phone_photos_status check (status in ('pending', 'ready'))
);

create index phone_sessions_owner_idx on public.phone_sessions (owner_id, created_at desc);
create index phone_photos_session_idx on public.phone_photos (session_id, created_at);

alter table public.phone_sessions enable row level security;
alter table public.phone_photos enable row level security;

revoke all on public.phone_sessions, public.phone_photos from anon, authenticated;
grant select, insert, delete on public.phone_sessions to authenticated;
grant select, delete on public.phone_photos to authenticated;
grant all on public.phone_sessions, public.phone_photos to service_role;

-- The phone itself never queries these tables: the server looks the session
-- up with the service role. Signed-in owners see and end their own sessions.
create policy "Own phone sessions"
  on public.phone_sessions for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Start own phone sessions"
  on public.phone_sessions for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (
      design_id is null
      or exists (
        select 1 from public.designs d
        where d.id = design_id and d.owner_id = (select auth.uid())
      )
    )
  );
create policy "End own phone sessions"
  on public.phone_sessions for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "Own phone photos"
  on public.phone_photos for select to authenticated
  using (
    exists (
      select 1 from public.phone_sessions s
      where s.id = session_id and s.owner_id = (select auth.uid())
    )
  );
create policy "Discard own phone photos"
  on public.phone_photos for delete to authenticated
  using (
    exists (
      select 1 from public.phone_sessions s
      where s.id = session_id and s.owner_id = (select auth.uid())
    )
  );
