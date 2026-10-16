-- Preview copies of big models (RIL-87). The browser preview refuses an
-- STL over 25 MB or 500k triangles, so such a model gets a simplified copy
-- beside it in R2, made by the server after publish or by the nightly
-- sweep. The column names the copy's object key; null means none exists.
-- The download always serves the original.

alter table public.design_files
  add column preview_object_key text;
