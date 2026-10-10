-- PROPOSAL ONLY. Not a migration and not applied by `supabase db push`.
-- Profiles now live in migrations/20261010000000_profiles.sql. Each remaining table moves
-- into a numbered migration as its feature is built, after review: publication
-- must require confirmed files, and design_files is written only by trusted
-- server code. See docs/next-milestone.md.
-- All problem grades refer to a 40 degree board; 0 represents the V0–V1 group.

create table public.designs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 80),
  description text not null check (char_length(trim(description)) between 20 and 5000),
  hold_type text not null check (hold_type in ('Jug', 'Crimp', 'Sloper', 'Pinch', 'Pocket', 'Foothold')),
  size text not null check (size in ('Small', 'Medium', 'Large')),
  mounting text not null check (mounting in ('Bolt-on', 'Screw-on', 'Dual mount')),
  problem_grade smallint check (problem_grade = 0 or problem_grade between 2 and 17),
  tags text[] not null default '{}',
  license text not null check (license in ('CC BY 4.0', 'CC BY-NC 4.0', 'CC0 1.0')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  check (cardinality(tags) <= 12)
);

create table public.print_recipes (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs(id) on delete cascade,
  material text not null check (char_length(trim(material)) between 1 and 80),
  special_process text check (special_process in ('Salt annealing (heat treatment in salt)', 'Printing with liquid resin', 'Making a pattern to cast holds', 'Other (describe in notes)')),
  notes text not null default '' check (char_length(notes) <= 2000),
  texture_notes text not null default '' check (char_length(texture_notes) <= 2000),
  post_processing text not null default '' check (char_length(post_processing) <= 200),
  created_at timestamptz not null default now()
);

-- Trusted server code verifies R2 objects before inserting completed file metadata.
-- Browser clients can read authorized metadata but cannot write this table.
create table public.design_files (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs(id) on delete cascade,
  object_key text not null unique,
  name text not null check (char_length(name) between 1 and 255),
  bytes bigint not null check (bytes between 1 and 104857600),
  kind text not null check (kind in ('model', 'photo')),
  extension text not null,
  position smallint not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(trim(body)) between 10 and 2000),
  material text not null default '' check (char_length(material) <= 80),
  print_settings text not null default '' check (char_length(print_settings) <= 500),
  post_processing text not null default '' check (char_length(post_processing) <= 200),
  problem_grade smallint check (problem_grade = 0 or problem_grade between 2 and 17),
  created_at timestamptz not null default now()
);

create table public.bookmarks (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  design_id uuid not null references public.designs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, design_id)
);

create index designs_owner_idx on public.designs(owner_id);
create index designs_browse_idx on public.designs(status, hold_type, mounting, created_at desc);
create index designs_search_idx on public.designs using gin (to_tsvector('english', title || ' ' || description));
create index recipes_design_idx on public.print_recipes(design_id);
create index files_design_idx on public.design_files(design_id);
create index reviews_design_idx on public.reviews(design_id, created_at desc);
create index reviews_author_idx on public.reviews(author_id);
create index bookmarks_design_idx on public.bookmarks(design_id);

alter table public.designs enable row level security;
alter table public.print_recipes enable row level security;
alter table public.design_files enable row level security;
alter table public.reviews enable row level security;
alter table public.bookmarks enable row level security;

-- Remove Supabase default grants; explicitly grant only the supported operations.
revoke all on public.designs, public.print_recipes, public.design_files, public.reviews, public.bookmarks from anon, authenticated;
grant select on public.designs, public.print_recipes, public.design_files, public.reviews to anon, authenticated;
grant insert, update, delete on public.designs, public.print_recipes, public.reviews to authenticated;
grant select, insert, delete on public.bookmarks to authenticated;
grant all on public.designs, public.print_recipes, public.design_files, public.reviews, public.bookmarks to service_role;


create policy "Read published designs or own drafts" on public.designs for select using (status = 'published' or owner_id = (select auth.uid()));
create policy "Create own designs" on public.designs for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Update own designs" on public.designs for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Delete own designs" on public.designs for delete to authenticated using (owner_id = (select auth.uid()));

create policy "Read recipes for visible designs" on public.print_recipes for select using (
  exists (select 1 from public.designs d where d.id = design_id)
);
create policy "Create recipes for own designs" on public.print_recipes for insert to authenticated with check (
  exists (select 1 from public.designs d where d.id = design_id and d.owner_id = (select auth.uid()))
);
create policy "Update recipes for own designs" on public.print_recipes for update to authenticated using (
  exists (select 1 from public.designs d where d.id = design_id and d.owner_id = (select auth.uid()))
) with check (
  exists (select 1 from public.designs d where d.id = design_id and d.owner_id = (select auth.uid()))
);
create policy "Delete recipes for own designs" on public.print_recipes for delete to authenticated using (
  exists (select 1 from public.designs d where d.id = design_id and d.owner_id = (select auth.uid()))
);

create policy "Read file metadata for visible designs" on public.design_files for select using (
  exists (select 1 from public.designs d where d.id = design_id)
);

create policy "Read reviews for visible designs" on public.reviews for select using (
  exists (select 1 from public.designs d where d.id = design_id)
);
create policy "Review published designs" on public.reviews for insert to authenticated with check (
  author_id = (select auth.uid()) and exists (select 1 from public.designs d where d.id = design_id and d.status = 'published')
);
create policy "Update own reviews on published designs" on public.reviews for update to authenticated using (author_id = (select auth.uid())) with check (
  author_id = (select auth.uid()) and exists (select 1 from public.designs d where d.id = design_id and d.status = 'published')
);
create policy "Delete own reviews" on public.reviews for delete to authenticated using (author_id = (select auth.uid()));

create policy "Read own bookmarks" on public.bookmarks for select to authenticated using (owner_id = (select auth.uid()));
create policy "Bookmark visible designs" on public.bookmarks for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists (select 1 from public.designs d where d.id = design_id)
);
create policy "Delete own bookmarks" on public.bookmarks for delete to authenticated using (owner_id = (select auth.uid()));
