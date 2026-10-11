-- Bug reports, feedback, and design reports from the widget in the footer.
-- Rows are written only by the server, which also forwards each one to the
-- owner's webhook; nobody reads them through the API, so there are no
-- policies and no grants for the user-facing roles.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles (id) on delete set null,
  contact text not null default '',
  page text not null default '',
  body text not null,
  created_at timestamptz not null default now(),
  constraint feedback_contact_length check (char_length(contact) <= 120),
  constraint feedback_page_length check (char_length(page) <= 300),
  constraint feedback_body_length check (char_length(body) between 10 and 2000)
);

create index feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant all on public.feedback to service_role;
