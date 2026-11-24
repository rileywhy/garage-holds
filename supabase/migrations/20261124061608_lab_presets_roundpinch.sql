-- Round Pinch presets use their own lab key. Keep earlier pinch presets readable.
alter table public.lab_presets drop constraint lab_presets_lab;
alter table public.lab_presets
  add constraint lab_presets_lab
    check (lab in ('crimp', 'sloper', 'jug', 'foot', 'pocket', 'pinch', 'crack', 'custom-shape', 'roundpinch'));
