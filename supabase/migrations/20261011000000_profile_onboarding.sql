-- Profile setup step: new users confirm their display name (and may add a
-- short bio) before using account features. onboarded_at records completion.

alter table public.profiles
  add column bio text not null default ''
    constraint profiles_bio_length check (char_length(bio) <= 280),
  add column onboarded_at timestamptz;

grant update (bio, onboarded_at) on public.profiles to authenticated;
