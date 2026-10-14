# Hosted setup

What has to be configured outside this repo for accounts to work, and where
each value goes. Nothing here is secret except where marked.

## Environment variables

| Variable                               | Where it is used | Secret? | Where to find it                                                                                                                              |
| -------------------------------------- | ---------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Browser + server | No      | Supabase dashboard → Project Settings → API → Project URL                                                                                     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + server | No      | Supabase dashboard → Project Settings → API Keys → Publishable key (`sb_publishable_…`)                                                       |
| `SUPABASE_SECRET_KEY`                  | Server only      | **Yes** | Supabase dashboard → Project Settings → API Keys → Secret keys → create one                                                                   |
| `R2_ACCOUNT_ID`                        | Server only      | No      | The 32-character hex string in the R2 S3 endpoint URL                                                                                         |
| `R2_ACCESS_KEY_ID`                     | Server only      | **Yes** | Cloudflare → R2 → Manage R2 API Tokens → create a token scoped to the bucket                                                                  |
| `R2_SECRET_ACCESS_KEY`                 | Server only      | **Yes** | Shown once when the R2 token is created                                                                                                       |
| `R2_BUCKET_NAME`                       | Server only      | No      | The bucket you created                                                                                                                        |
| `CRON_SECRET`                          | Server only      | **Yes** | Any long random string; Vercel sends it with the nightly storage sweep (below)                                                                |
| `ALERT_WEBHOOK_URL`                    | Server only      | **Yes** | A Discord or Slack incoming webhook; receives feedback, design reports, and allowance notices                                                 |
| `NEXT_PUBLIC_CONTACT_EMAIL`            | Browser + server | No      | Shown to people who reach their upload allowance so they can ask for more                                                                     |
| `NEXT_PUBLIC_SITE_URL`                 | Browser + server | No      | The public origin for the sitemap and link previews: `https://garageholds.com` in Production. Vercel's own URL is used where it is unset      |
| `NEXT_PUBLIC_AMAZON_TAG`               | Browser + server | No      | The Amazon Associates tracking id (`garageholds-20`). Shopping links in the guide and the labs carry it; unset, they point at Amazon untagged |
| `NEXT_PUBLIC_TIP_URL`                  | Browser + server | No      | The tip jar page, a Ko-fi URL. The footer links to it when set                                                                                |

Locally these go in `.env.local` (git-ignored). On Vercel they go in Project →
Settings → Environment Variables, followed by a redeploy. Secrets never go in
chat, commits, or `NEXT_PUBLIC_*` names.

The Supabase and R2 variables are set for both Production and Preview, so a
push to any branch other than `main` gets its own preview URL showing the
real pile. That is the way to try a change before it goes live: review on
the preview, then merge to `main`. `CRON_SECRET` stays Production-only so
previews never run the storage sweep. Signing in on a preview also needs
`https://*-garage-holds.vercel.app/**` in Supabase's redirect allowlist
(see Accounts below); browsing works without it.

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
         "https://garageholds.com",
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
   - Site URL: `https://garageholds.com`.
   - Redirect URLs, one per line:
     - `https://garageholds.com/**`
     - `https://garage-holds.vercel.app/**`
     - `https://*-garage-holds.vercel.app/**` (preview deployments)
     - `http://127.0.0.1:3000/**`
     - `http://localhost:3000/**`
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
   - Authorized JavaScript origins: `http://127.0.0.1:3000`, `http://localhost:3000`, and `https://garageholds.com`.
   - Authorized redirect URIs: the Supabase callback URL from above
     (`https://<project-ref>.supabase.co/auth/v1/callback`). Not the app's own
     `/auth/callback`; Supabase talks to Google, then redirects to the app.
   - Copy the Client ID and Client Secret into the Supabase Google provider.

## Migrations and the Supabase CLI

`supabase/migrations/*.sql` is the schema. Files are named
`<YYYYMMDDHHMMSS>_<name>.sql`, the Supabase CLI convention, and run in
filename order. `supabase/config.toml` configures the local stack the CLI
runs in Docker (`docs/local-stack.md`).

The CLI is a dev dependency, so `npx supabase …` works after `npm ci` with no
separate install. It needs a personal access token for the hosted project:
`npx supabase login` stores one, or set `SUPABASE_ACCESS_TOKEN` (Account →
Access Tokens in the dashboard). Both are secrets.

The first four migrations were pasted into the SQL editor by hand and later
recorded in the hosted project's migration history
(`supabase_migrations.schema_migrations`), which is what
`supabase migration repair --status applied <version>` does for any future
hand-applied file. Link the project once on your machine:

```sh
npx supabase link --project-ref hbwvqjktqdxyspaqyshb   # asks for the database password
npx supabase migration list --linked                   # every version in both columns
npx supabase db push --dry-run                         # "Remote database is up to date."
```

From then on a new migration is a new file (`npx supabase migration new
<name>` creates one with the right timestamp), applied with
`npx supabase db push`. Never edit a migration that has been applied.

`src/lib/supabase/database.types.ts` is generated, never hand-edited.
`npm run db:types` regenerates it from the local stack; after a migration is
pushed, confirm the hosted project agrees with
`npx supabase gen types typescript --linked --schema public` (same output,
run through `npx prettier --write`). Check `db.major_version` in
`supabase/config.toml` against Project Settings → Infrastructure so the local
Postgres matches the hosted one.

## Storage sweep

An upload that fails after its draft was created is removed by the browser
right away (`abandonDraft` in `src/features/uploads/actions.ts`). Whatever
that misses, a closed tab or a failed delete, is reconciled by
`GET /api/sweep`: drafts and phone sessions older than a day are deleted with
their objects, and objects under `designs/` or `inbox/` that no row refers to
are deleted once they are a day old, so an upload still in flight is never
touched.

`vercel.json` schedules it nightly through Vercel Cron, which sends
`Authorization: Bearer <CRON_SECRET>`. Set `CRON_SECRET` in the Vercel
project (Settings → Environment Variables, then redeploy); without it the
route answers 503 and nothing runs. To see what a sweep would do before the
first real one:

```sh
curl -H "Authorization: Bearer $CRON_SECRET" "https://garageholds.com/api/sweep?dry=1"
```

The response counts abandoned drafts, stale phone sessions, their objects,
orphaned objects, and photos missing their display sizes. The sweep also
makes those sizes: every photo is stored with resampled copies beside it
(`-card` at 800 px and `-large` at 1600 px, see
`src/features/uploads/photo-sizes.ts`) so cards and the design page never
have to shrink a full phone photo in the browser, which turns chalk and
texture into shimmer. Uploads make them as they finish; the sweep catches
up anything uploaded before this existed.
Without `dry=1` the same call performs the sweep. Vercel's Hobby plan runs
cron jobs once a day at an approximate time, which is enough here.

## Upload allowance

Every account may hold 20 designs and 2 GB of files by default
(`supabase/migrations/20261016000000_upload_limits.sql`). The upload and
phone-photo steps refuse anything past that with a message naming
`NEXT_PUBLIC_CONTACT_EMAIL`, and "My designs" shows each person their usage.

When someone is refused, or a publish takes them past 80% of either limit,
the server posts one line to `ALERT_WEBHOOK_URL`. In Discord: server
settings → Integrations → Webhooks → New Webhook, pick a channel, copy the
URL. Slack's incoming webhooks work the same way. Set the variable in
Vercel and redeploy. Without it the line goes to the runtime log only.

To raise someone's allowance, run this in the SQL editor (or ask Claude
through the Supabase connector):

```sql
update public.profiles
  set upload_limit_designs = 100, upload_limit_bytes = 10 * 1024 * 1024 * 1024
  where display_name = 'their display name';
```

Users cannot change these columns themselves; the update grant on profiles
does not include them.

## Feedback and reports

The footer's "Report a bug or send feedback" and the "Report this design"
link on every design page open the same small form. Each message is stored
in the `feedback` table (`supabase/migrations/20261017000000_feedback.sql`),
which only the server reads, and forwarded as one line to
`ALERT_WEBHOOK_URL` with the sender's name and email when signed in, or
whatever contact they typed otherwise. A hidden honeypot field drops bot
submissions. To read everything ever sent:

```sql
select created_at, contact, page, body from public.feedback order by created_at desc;
```

## Crimp Lab's Python function

`/api/crimp` is `api/crimp.py`, a Vercel Python function built from the
root `requirements.txt`. It needs no settings. A preview build takes well
under a second; `vercel.json` allows it 30 seconds and 1 GB. If the function
ever exceeds Vercel's bundle size limit, add an `excludeFiles` entry for it
in `vercel.json` rather than trimming the Python.

## Search engines and link previews

`/robots.txt` and `/sitemap.xml` are generated by `src/app/robots.ts` and
`src/app/sitemap.ts`; the sitemap lists the home page and every published
design and refreshes hourly. Every page carries Open Graph tags, and design
pages use their first photo, so a pasted link shows a card in chats and on
social sites.

The site is verified in Google Search Console
(https://search.google.com/search-console) as a Domain property through a
TXT record on `garageholds.com` in Vercel DNS, with the sitemap submitted.
Page views are recorded by Vercel Web Analytics, enabled on the project
and mounted in `src/app/layout.tsx`; no cookies, so no banner.

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
- `supabase/migrations/20261014000000_function_grants.sql` stops the
  sign-up trigger function being callable through the REST API.
- `supabase/migrations/20261018000000_file_orientation.sql` stores how each
  uploaded model faces in previews.
- `supabase/migrations/20261015000000_phone_photos.sql` adds phone sessions
  and the photo inbox behind the QR code on the upload and edit pages. The
  phone page needs no sign-in; the unguessable session id is the credential,
  it expires after 15 minutes, and the server checks it on every upload.
- `src/features/uploads/actions.ts` is the upload pipeline: create the draft
  and sign one PUT URL per file, the browser uploads directly to R2, then the
  server confirms each object's existence and size, marks it ready, and
  publishes. A failure after the draft exists abandons it again.
- `src/features/uploads/lifecycle.ts` is the nightly reconciliation
  described above, run by `src/app/api/sweep/route.ts`; the integration tests
  exercise it on the local stack with an in-memory bucket.
- `src/features/holds/repository.ts` reads designs, reviews, and bookmarks as
  the signed-in user and attaches signed R2 URLs for photos and downloads.
