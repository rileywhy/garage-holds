-- Shapes saved from the labs, so a preset follows the account instead of
-- one browser and shows under Saved next to the bookmarked designs. The
-- payload is the lab's shareable link query ("?edge_depth=20"): it opens
-- the same shape in the lab and is the one format every lab speaks. The
-- Custom Shape Lab's painted mask rides in that query too, hence the room.

create table public.lab_presets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  lab text not null,
  name text not null,
  search text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lab_presets_lab
    check (lab in ('crimp', 'sloper', 'jug', 'foot', 'custom-shape')),
  constraint lab_presets_name_length check (char_length(name) between 1 and 40),
  constraint lab_presets_search_length check (char_length(search) <= 6000)
);

create index lab_presets_owner_idx
  on public.lab_presets (owner_id, lab, created_at desc);

create trigger lab_presets_set_updated_at
  before update on public.lab_presets
  for each row execute function public.set_updated_at();

alter table public.lab_presets enable row level security;

create policy "Read own lab presets"
  on public.lab_presets for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Save own lab presets"
  on public.lab_presets for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Update own lab presets"
  on public.lab_presets for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "Delete own lab presets"
  on public.lab_presets for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.lab_presets from anon, authenticated;
grant select, insert, delete on public.lab_presets to authenticated;
grant update (name, search) on public.lab_presets to authenticated;
grant all on public.lab_presets to service_role;
