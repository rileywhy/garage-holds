-- Catalog search and pagination in the database (RIL-25).
--
-- The home page used to read every published design and filter in
-- TypeScript. The filters were already plain column matches; search was
-- the one thing the database could not do, so each design now carries a
-- search vector over its own text and its creator's name, kept current by
-- triggers and indexed for prefix queries ("cri" finds "Crimp"). The
-- creator's name has to be denormalised, because a vector cannot be a
-- generated column when it reads another table.

alter table public.designs add column search tsvector;

-- Everything the old client-side search looked at. The 'simple' config
-- lowercases without stemming, so names and material codes match as typed.
create function public.set_design_search()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator text;
begin
  select display_name into creator
    from public.profiles where id = new.owner_id;
  new.search := to_tsvector(
    'simple',
    concat_ws(
      ' ',
      new.title,
      new.description,
      new.hold_type,
      new.size,
      new.mounting,
      array_to_string(new.tags, ' '),
      new.material,
      new.special_process,
      new.texture_notes,
      new.post_processing,
      new.print_notes,
      creator
    )
  );
  return new;
end;
$$;

create trigger designs_set_search
  before insert or update on public.designs
  for each row execute function public.set_design_search();

-- A renamed creator is searchable under the new name. Definer rights: the
-- person renaming has no grant on the search column, and the designs
-- trigger above recomputes the vector from the new name.
create function public.refresh_design_search()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.display_name is distinct from old.display_name then
    update public.designs set search = null where owner_id = new.id;
  end if;
  return new;
end;
$$;

create trigger profiles_refresh_design_search
  after update of display_name on public.profiles
  for each row execute function public.refresh_design_search();

revoke execute on function public.set_design_search() from public, anon, authenticated;
revoke execute on function public.refresh_design_search() from public, anon, authenticated;

create index designs_search_idx on public.designs using gin (search);

-- Existing rows: the trigger fills the vector in.
update public.designs set search = null;

-- How many published designs there are of each type, for the filter
-- sidebar. A view runs as the reader, so the policies still apply.
create view public.catalog_type_counts
with (security_invoker = true) as
  select hold_type, count(*)::integer as designs
  from public.designs
  where status = 'published'
  group by hold_type;

grant select on public.catalog_type_counts to anon, authenticated;
