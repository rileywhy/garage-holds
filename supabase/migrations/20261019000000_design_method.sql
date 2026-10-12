-- Existing designs are human-shaped, as confirmed by the site owner.
-- Only this backfill gets a default: every future insert must choose a method.
alter table public.designs
  add column design_method text not null default 'human-shaped'
  constraint designs_design_method check (design_method in ('human-shaped', 'generated'));

alter table public.designs alter column design_method drop default;
grant update (design_method) on public.designs to authenticated;
