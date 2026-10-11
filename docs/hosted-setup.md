# Hosted setup

What has to be configured outside this repo for accounts to work, and where
each value goes. Nothing here is secret except where marked.

## Environment variables

| Variable                               | Where it is used | Secret? | Where to find it                                                                        |
| -------------------------------------- | ---------------- | ------- | --------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Browser + server | No      | Supabase dashboard → Project Settings → API → Project URL                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + server | No      | Supabase dashboard → Project Settings → API Keys → Publishable key (`sb_publishable_…`) |
| `SUPABASE_SECRET_KEY`                  | Server only      | **Yes** | Supabase dashboard → Project Settings → API Keys → Secret keys → create one             |
| `R2_ACCOUNT_ID`                        | Server only      | No      | The 32-character hex string in the R2 S3 endpoint URL                                   |
| `R2_ACCESS_KEY_ID`                     | Server only      | **Yes** | Cloudflare → R2 → Manage R2 API Tokens → create a token scoped to the bucket            |
| `R2_SECRET_ACCESS_KEY`                 | Server only      | **Yes** | Shown once when the R2 token is created                                                 |
| `R2_BUCKET_NAME`                       | Server only      | No      | The bucket you created                                                                  |

Locally these go in `.env.local` (git-ignored). On Vercel they go in Project →
Settings → Environment Variables, followed by a redeploy. Secrets never go in
chat, commits, or `NEXT_PUBLIC_*` names.

Reads and most writes run as the signed-in user, so row-level security decides
what each person can see and change. The secret key is used for exactly one
thing: recording that an uploaded object really exists in R2 with the declared
size. Users cannot be trusted to assert that themselves.

Without the two Supabase variables the app still runs with no accounts and an
empty library. Without the secret key or the R2 variables, browsing works but
the upload form reports that uploads are not configured.

## Cloudflare R2

1. Dashboard → **R2 Object Storage** → Create bucket, name `garage-holds`,
   location Automatic.
2. **Manage R2 API Tokens** → Create API token: permission **Object Read & Write**,
   limited to that bucket. Copy the access key id and secret into the variables
   above. The account id is the hex string in the endpoint URL shown there.
3. Bucket → **Settings → CORS policy**. Browsers upload straight to the bucket
   with signed PUT URLs and fetch STL previews with signed GET URLs, so the
   bucket must allow the site's origins:

   ```json
   [
     {
       "AllowedOrigins": [
         "https://garage-holds.vercel.app",
         "http://127.0.0.1:3000"
       ],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

The bucket stays private. Downloads and photos use signed URLs that expire
after an hour, so draft files never leak and paid downloads can be gated later
without moving anything.

## Supabase: Authentication settings

Dashboard → Authentication.

1. **URL Configuration**
   - Site URL: the production URL once Vercel exists (for now `http://127.0.0.1:3000`).
   - Redirect URLs, one per line:
     - `http://127.0.0.1:3000/**`
     - `http://localhost:3000/**`
     - `https://<your-vercel-project>.vercel.app/**`
     - `https://*-<your-vercel-team>.vercel.app/**` (preview deployments; optional)
2. **Sign In / Providers → Email**
   - Enable the provider. Leave "Confirm email" on.
   - The app sends a one-time **code**, not a link, so the templates must
     include the token. Under **Emails → Templates**, edit both **Magic Link**
     and **Confirm sign up** so the body contains `{{ .Token }}`, for example:

     ```
     Your Garage Holds sign-in code is {{ .Token }}. It expires in one hour.
     If you didn't request this, you can ignore this email.
     ```

   - Set **Email OTP Expiration** to `600` seconds (10 minutes). The default
     6-digit length is fine.
   - The built-in mailer allows only a few emails per hour, enough for a
     two-account test. Before sharing more widely, add custom SMTP under
     **Emails → SMTP Settings** (Resend's free tier works).
3. **Sign In / Providers → Google**
   - Enable, then paste the Client ID and Client Secret from the Google step
     below. Leave "Skip nonce check" off.
   - Note the **Callback URL** shown there; it is
     `https://<project-ref>.supabase.co/auth/v1/callback` and Google needs it.

## Google Cloud: OAuth client

Google Cloud console, in the project you intend to use.

1. **APIs & Services → OAuth consent screen** (now under "Google Auth Platform").
   - User type External. App name "Garage Holds", support email, developer email.
   - Scopes: the defaults (`openid`, `email`, `profile`) are enough.
   - While in "Testing" status only listed test users can sign in. Add both
     test accounts there, or publish the app when ready.
2. **Credentials → Create credentials → OAuth client ID**
   - Application type: Web application.
   - Authorized JavaScript origins: `http://127.0.0.1:3000`, `http://localhost:3000`, and the Vercel URL.
   - Authorized redirect URIs: the Supabase callback URL from above
     (`https://<project-ref>.supabase.co/auth/v1/callback`). Not the app's own
     `/auth/callback`; Supabase talks to Google, then redirects to the app.
   - Copy the Client ID and Client Secret into the Supabase Google provider.

## Applying migrations

`supabase/migrations/*.sql` is the schema. `supabase/proposed-library.sql` is a
draft and is not applied.

Files are named `<YYYYMMDDHHMMSS>_<name>.sql`, the Supabase CLI convention, and
run in filename order.

Fastest for now: open the project's SQL editor
(`https://supabase.com/dashboard/project/<project-ref>/sql/new`), paste one
migration file, run it, and repeat for any later file, in order, once each.

Longer term the Supabase CLI applies them (`supabase link --project-ref <ref>`
then `supabase db push`), and the same CLI runs the local Docker stack the
ownership tests will use. When we switch to the CLI, any migration already
applied by hand is recorded with
`supabase migration repair --status applied <version>` so `db push` does not
try to run it again.

## What the app does with all this

- `src/proxy.ts` refreshes the session cookie on each navigation and sends
  signed-out visitors away from `/account`.
- `src/features/auth/actions.ts` holds the server functions: email code
  request and verify, Google redirect, sign out, display-name update.
- `src/app/auth/callback/route.ts` finishes Google sign-in by exchanging the
  code for a session.
- `supabase/migrations/20261010000000_profiles.sql` creates a profile for every new user
  (name and avatar from Google when available, otherwise the email's local
  part) and enforces unique, editable display names.
- `supabase/migrations/20261011000000_profile_onboarding.sql` adds the bio and
  the `onboarded_at` stamp. A user's first sign-in lands on `/welcome` to
  confirm their display name; `/account` edits the same fields later.
- `supabase/migrations/20261012000000_library.sql` creates designs, their
  files, reviews, and bookmarks. Only published designs are visible to others;
  a database trigger refuses to publish a design without a verified model
  file; `design_files` rows are written only by the server after checking R2.
- `supabase/migrations/20261013000000_service_role_grants.sql` gives the
  service role its table grants back; without it, file registration fails
  with "permission denied for table design_files".
- `src/features/uploads/actions.ts` is the upload pipeline: create the draft
  and sign one PUT URL per file, the browser uploads directly to R2, then the
  server confirms each object's existence and size, marks it ready, and
  publishes.
- `src/features/holds/repository.ts` reads designs, reviews, and bookmarks as
  the signed-in user and attaches signed R2 URLs for photos and downloads.
