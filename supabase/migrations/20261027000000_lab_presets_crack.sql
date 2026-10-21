-- The Crack Lab saves presets to the account like the other labs; the lab
-- name check lists the labs it accepts.

alter table public.lab_presets drop constraint lab_presets_lab;
alter table public.lab_presets
  add constraint lab_presets_lab
    check (lab in ('crimp', 'sloper', 'jug', 'foot', 'pocket', 'pinch', 'crack', 'custom-shape'));
