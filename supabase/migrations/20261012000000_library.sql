-- The shared library: designs with their recipe, the files behind them,
-- reviews, and bookmarks. Ownership is always the immutable profile id.
-- Problem grades refer to a 40 degree board; 0 is the V0–V1 group.

create table public.designs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null,
  hold_type text not null,
  size text not null,
  mounting text not null,
  problem_grade smallint,
  tags text[] not null default '{}',
  license text not null,
  material text not null,
  special_process text,
  print_notes text not null default '',
  texture_notes text not null default '',
  post_processing text not null default '',
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint designs_title_length check (char_length(title) between 3 and 80),
  constraint designs_description_length
    check (char_length(description) between 20 and 5000),
  constraint designs_hold_type
    check (hold_type in ('Jug', 'Crimp', 'Sloper', 'Pinch', 'Pocket', 'Foothold')),
  constraint designs_size check (size in ('Small', 'Medium', 'Large')),
  constraint designs_mounting
    check (mounting in ('Bolt-on', 'Screw-on', 'Dual mount')),
  constraint designs_problem_grade
    check (problem_grade is null or problem_grade = 0 or problem_grade between 2 and 17),
  constraint designs_tags check (cardinality(tags) <= 12),
  constraint designs_license
    check (license in ('CC BY 4.0', 'CC BY-NC 4.0', 'CC0 1.0')),
  constraint designs_material_length check (char_length(material) between 1 and 80),
  constraint designs_special_process check (
    special_process is null or special_process in (
      'Salt annealing (heat treatment in salt)',
      'Printing with liquid resin',
      'Making a pattern to cast holds',
      'Other (describe in notes)'
    )
  ),
  constraint designs_print_notes_length check (char_length(print_notes) <= 2000),
  constraint designs_texture_notes_length check (char_length(texture_notes) <= 2000),
  constraint designs_post_processing_length
    check (char_length(post_processing) <= 200),
  constraint designs_status check (status in ('draft', 'published'))
);

-- Object metadata. Rows are written only by trusted server code after the
-- object in R2 has been verified; browsers never insert or update them.
create table public.design_files (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs (id) on delete cascade,
  kind text not null,
  object_key text not null unique,
  name text not null,
  extension text not null,
  bytes bigint not null,
  position smallint not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint design_files_kind check (kind in ('model', 'photo')),
  constraint design_files_name_length check (char_length(name) between 1 and 255),
  constraint design_files_bytes check (bytes between 1 and 104857600),
  constraint design_files_position check (position >= 0),
  constraint design_files_status check (status in ('pending', 'ready'))
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null,
  body text not null,
  material text not null default '',
  print_settings text not null default '',
  post_processing text not null default '',
  problem_grade smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_rating check (rating between 1 and 5),
  constraint reviews_body_length check (char_length(body) between 10 and 2000),
  constraint reviews_material_length check (char_length(material) <= 80),
  constraint reviews_print_settings_length check (char_length(print_settings) <= 500),
  constraint reviews_post_processing_length
    check (char_length(post_processing) <= 200),
  constraint reviews_problem_grade
    check (problem_grade is null or problem_grade = 0 or problem_grade between 2 and 17),
  constraint reviews_one_per_author unique (design_id, author_id)
);

create table public.bookmarks (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  design_id uuid not null references public.designs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, design_id)
);

create index designs_owner_idx on public.designs (owner_id, created_at desc);
create index designs_published_idx
  on public.designs (published_at desc) where status = 'published';
create index design_files_design_idx on public.design_files (design_id, kind, position);
create index reviews_design_idx on public.reviews (design_id, created_at desc);
create index reviews_author_idx on public.reviews (author_id);
create index bookmarks_design_idx on public.bookmarks (design_id);

create trigger designs_set_updated_at
  before update on public.designs
  for each row execute function public.set_updated_at();

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

-- A design can only be published once at least one model file has been
-- verified, no matter who issues the update. Publication time is set here.
create function public.enforce_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    if not exists (
      select 1 from public.design_files f
      where f.design_id = new.id and f.kind = 'model' and f.status = 'ready'
    ) then
      raise exception 'A design needs at least one verified model file before it can be published'
        using errcode = 'check_violation';
    end if;
    new.published_at := now();
  end if;
  if new.status = 'draft' then
    new.published_at := null;
  end if;
  return new;
end;
$$;

create trigger designs_enforce_publication
  before update on public.designs
  for each row execute function public.enforce_publication();

-- Inserts always start as drafts.
create function public.start_as_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.status := 'draft';
  new.published_at := null;
  return new;
end;
$$;

create trigger designs_start_as_draft
  before insert on public.designs
  for each row execute function public.start_as_draft();

alter table public.designs enable row level security;
alter table public.design_files enable row level security;
alter table public.reviews enable row level security;
alter table public.bookmarks enable row level security;

revoke all on public.designs, public.design_files, public.reviews, public.bookmarks
  from anon, authenticated;
grant select on public.designs, public.design_files, public.reviews to anon, authenticated;
grant insert, delete on public.designs to authenticated;
grant update (
  title, description, hold_type, size, mounting, problem_grade, tags, license,
  material, special_process, print_notes, texture_notes, post_processing, status
) on public.designs to authenticated;
grant insert, delete on public.reviews to authenticated;
grant update (rating, body, material, print_settings, post_processing, problem_grade)
  on public.reviews to authenticated;
grant select, insert, delete on public.bookmarks to authenticated;

-- A design is visible when published, or to its owner in any state.
create function public.can_view_design(design uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.designs d
    where d.id = design
      and (d.status = 'published' or d.owner_id = (select auth.uid()))
  );
$$;

create policy "Read published designs or own drafts"
  on public.designs for select
  using (status = 'published' or owner_id = (select auth.uid()));
create policy "Create own designs"
  on public.designs for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Update own designs"
  on public.designs for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "Delete own designs"
  on public.designs for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "Read files of visible designs"
  on public.design_files for select
  using (public.can_view_design(design_id));

create policy "Read reviews of visible designs"
  on public.reviews for select
  using (public.can_view_design(design_id));
create policy "Review published designs"
  on public.reviews for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.designs d
      where d.id = design_id and d.status = 'published'
    )
  );
create policy "Update own reviews"
  on public.reviews for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));
create policy "Delete own reviews"
  on public.reviews for delete to authenticated
  using (author_id = (select auth.uid()));

create policy "Read own bookmarks"
  on public.bookmarks for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Bookmark visible designs"
  on public.bookmarks for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.can_view_design(design_id));
create policy "Delete own bookmarks"
  on public.bookmarks for delete to authenticated
  using (owner_id = (select auth.uid()));
