-- How an uploaded model is turned for its previews: the axes the hold's
-- own X, Y and Z land on, e.g. 'x,-y,-z' for a model that came in upside
-- down. The file itself is never changed. Written by the server after the
-- owner picks it (see src/features/holds/orientation.ts).

alter table public.design_files
  add column orientation text not null default 'x,y,z',
  add constraint design_files_orientation
    check (orientation ~ '^-?[xyz],-?[xyz],-?[xyz]$');
