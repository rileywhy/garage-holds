-- The Pocket Lab saves presets to the account like the other labs; the
-- lab name check listed the labs that existed when the table was made.

alter table public.lab_presets drop constraint lab_presets_lab;
alter table public.lab_presets
  add constraint lab_presets_lab
    check (lab in ('crimp', 'sloper', 'jug', 'foot', 'pocket', 'custom-shape'));
