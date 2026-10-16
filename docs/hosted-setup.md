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
| `PREVIEW_SECRET`                       | Server only      | No      | Shared with the preview_mesh function; without it big models get no simplified preview copy (see below)                                       |
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
     Your Garage Holds sign-in code is {{ .Token }}. It expires in 10 minutes.
     If you didn't request this, you can ignore this email.
     ```

   - Set **Email OTP Expiration** to `600` seconds (10 minutes). The default
     6-digit length is fine.
   - Codes are sent through **Brevo** (custom SMTP under **Emails → SMTP
     Settings**: host `smtp-relay.brevo.com`, port 587, the Brevo login as
     user and an SMTP key as password; sender `sign-in@garageholds.com`,
     name "Garage Holds"). `garageholds.com` is authenticated in Brevo
     (Senders & Domains → Domains) through four records in Vercel DNS: a
     `brevo-code:` TXT on the root, CNAMEs `brevo1._domainkey` and
     `brevo2._domainkey` to Brevo's DKIM hosts, and a `_dmarc` TXT with
     `p=none` reporting to Brevo. No mailbox exists at the sender address.
     Supabase's own limit on emails per hour (**Rate Limits**) is set to
     100; Brevo's free plan sends 300 a day.
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
   - The app's `/auth/callback` builds its final redirect from the request's
     `Origin`, `x-forwarded-host` and `Host` headers (`src/lib/request-origin.ts`).
     Vercel sets those from the real request, so they are safe here; on a host
     that passes client headers through unchecked they would become a
     header-controlled redirect target, and the origin should come from
     `NEXT_PUBLIC_SITE_URL` instead.
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

## Lab presets

"Save as preset" in any lab keeps the shape on screen. Signed in, it goes to
the `lab_presets` table (`supabase/migrations/20261020000000_lab_presets.sql`)
as the lab's shareable link query under a generated name, and shows in that
lab's starting-point menu and under Saved; signed out, it stays in the
browser's localStorage. Row-level security keeps every row to its owner, 30
per lab per account.

## Error alerts

Unhandled errors reach the same webhook, so you hear about a broken page
before anyone reports it. Two sources feed it:

- **Server.** `src/instrumentation.ts` exports Next.js's `onRequestError`
  hook, which runs for every uncaught error in a Server Component, route
  handler, server function, or the proxy. The line names the context and
  method, the route template (`/holds/[id]`, never the real id or the query
  string, so a phone-session id in the address cannot leak), and the error's
  name, message, and digest.
- **Browser.** `src/app/error.tsx` and `src/app/global-error.tsx` call
  `reportClientError` once when they appear. The line names the page's
  route template (again `/holds/[id]`, never the real id) and the message
  the browser saw, flattened to one line with no markdown; for a
  server-side failure that is a generic message plus the same digest as the
  server's line, so the two can be matched. The server validates and clips
  the report and stores nothing. Because anyone can call the action, each
  address gets five reports a quarter hour and the site thirty, like the
  feedback form; the rest are dropped.

Nothing else is sent: no headers, cookies, request bodies, or stack traces.
The line is clipped to 500 characters. A storm of the same error on the
same route sends one line a minute per server instance
(`src/lib/error-reports.ts`); Vercel's own Observability tab keeps the full
count and stack for each error group.

Without `ALERT_WEBHOOK_URL` the lines go to the runtime log, which Vercel
keeps for an hour. In development that log is the terminal running
`next dev`, which is how to see what a line would say.

## Outage alerts

Outages cannot report themselves. `/api/health` (`src/app/api/health/route.ts`)
answers 200 when the public Supabase client can read a published model
file's row and that object answers a HEAD in R2, and 503 when either fails;
a page render alone cannot tell, because signing happens locally and the
catalog degrades quietly. The response is never cached.

`.github/workflows/uptime.yml` fetches the home page, `/make`, the Crimp
Lab and `/api/health` on a schedule (and on demand from the Actions tab), passing on HTTP 200 within
20 seconds with one retry after 10 seconds. When a URL goes down it posts
one line to a Discord webhook naming the URL and the status code or
timeout, and one line when it is back; it remembers the previous state in
the Actions cache, so nothing repeats while the site stays down. The
webhook is the repository secret `DISCORD_ALERT_WEBHOOK`, set under the
repo's Settings → Secrets and variables → Actions (the same URL as
`ALERT_WEBHOOK_URL` works).

GitHub runs schedules on a best-effort basis: the 5-minute schedule ran
once in 6.5 hours on 15 Oct 2026, and GitHub pauses scheduled workflows in
a repository with no commits for 60 days. Treat the workflow as a backstop
and point an outside monitor (UptimeRobot or Better Stack, free tiers check
every 5 minutes and can post to the same Discord webhook) at
`https://garageholds.com/api/health`.

## Smoke test after each deploy

`.github/workflows/deploy-smoke.yml` runs `npm run test:smoke` against
every deployment Vercel reports as ready (GitHub's `deployment_status`
event), with `SMOKE_URL` set to the deployed site. It requests every page,
fails on any 5xx, and also fetches each generator's schema from
`/api/crimp`, `/api/sloper`, `/api/jug`, `/api/foot` and `/api/pocket`,
which only a deployment can serve because the Python functions run on Vercel alone.

- **Preview deployments** are checked at their own URL. A server error
  fails the check, which shows on the pull request beside CI, so look at it
  before merging.
- **Production** is checked at `https://garageholds.com` a minute after
  the deployment is ready, so the domain has moved to it, with one retry
  30 seconds later. A failure posts one line to `DISCORD_ALERT_WEBHOOK`
  naming the commit, its first failing routes and the run. The fix is a
  rollback in Vercel (Deployments → the previous production deployment →
  Instant Rollback) while the commit is reverted.

Repository secrets it reads (Settings → Secrets and variables → Actions):

| Secret                            | Needed for                                     | Where to find it                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DISCORD_ALERT_WEBHOOK`           | Production failure alerts (shared with uptime) | Already set for the uptime check; the same URL as `ALERT_WEBHOOK_URL` works. Without it the line is only logged                                                                                                                                                                                                            |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Previews behind Vercel's deployment protection | Vercel → Project → Settings → Deployment Protection → Protection Bypass for Automation → generate. The test sends it as the `x-vercel-protection-bypass` header. Previews use Vercel Authentication (every request redirects to Vercel's login), so without it every preview check fails with a message naming this secret |

Locally, the same check runs against any deployment:
`SMOKE_URL=https://<deployment>.vercel.app npm run test:smoke`, adding
`VERCEL_AUTOMATION_BYPASS_SECRET=…` for a protected preview.

## Crimp Lab's Python function

`/api/crimp` is `api/crimp.py`, a Vercel Python function built from the
root `requirements.txt`. It needs no settings. A preview build takes well
under a second; `vercel.json` allows it 30 seconds and 1 GB. If the function
ever exceeds Vercel's bundle size limit, add an `excludeFiles` entry for it
in `vercel.json` rather than trimming the Python.

## Preview copies of big models

The browser's 3D preview refuses an STL over 25 MB or 500,000 triangles
(`src/features/holds/stl-limits.ts`): every visitor scrolling past a card
would otherwise download and parse it. A model over either limit gets a
simplified copy, made once and stored beside the original as
`<key>-preview.stl`; `design_files.preview_object_key` names it. The viewer
and the card thumbnail load the copy, the download always serves the
original bytes, and a delete removes both.

The copy is made by `api/preview_mesh.py`, a Vercel Python function using
`fast-simplification` (quadric edge collapse; the triangle target is
150,000). `finalizeDesign` calls it after the publish response has gone
out (`after()` from `next/server`), so it never slows or fails a publish;
the nightly sweep makes any copy that is still missing. Vercel caps
function bodies at 4.5 MB, so the bytes never pass through the call: the
app sends a signed GET URL for the original and a signed PUT URL for the
copy, and the function downloads, simplifies and uploads.

`PREVIEW_SECRET` is a long random string the app sends as a bearer token
and the function checks, so nobody else can point it at a URL. Set it in
the Vercel project's environment variables (Production and Preview); both
sides read the same variable. Without it the step is skipped with a log
line and big models show the placeholder as before. `vercel.json` gives
the function 60 seconds and 1 GB. Locally, `python
tools/mesh-preview/serve_api.py` serves it on port 8790 with
`PREVIEW_API_URL=http://127.0.0.1:8790` in `.env.local`.

After a deploy, a design that was published before copies existed gets
one from the next sweep (04:00 UTC), or at once from
`curl -H "Authorization: Bearer $CRON_SECRET" https://garageholds.com/api/sweep`.

## Response headers

`next.config.ts` adds the baseline security headers to every route
(`src/lib/security-headers.ts`): `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, a referrer policy, a permissions policy, and a
Content-Security-Policy for static assets. `src/proxy.ts` adds a fresh nonce
to each page request and response; Next's inline scripts, the theme initializer,
and the guide's structured data carry it. Production scripts allow the site's
own bundles, that nonce, the fixed theme hash (also used by the error page), and
Vercel Analytics. Inline script execution without a nonce or the theme hash is
blocked. Development additionally allows eval for Next's debugger. Images and
connections allow HTTPS for signed R2 URLs and Supabase; styles allow inline
declarations used by the viewers. Vercel adds HSTS at the edge. Reading the nonce
in the layout makes page rendering dynamic even when accounts are unconfigured.

## Search engines and link previews

`/robots.txt` and `/sitemap.xml` are generated by `src/app/robots.ts` and
`src/app/sitemap.ts`; the sitemap lists the home page, the labs, the guide,
and every published design, and refreshes hourly. Every page carries Open
Graph tags with its own title and canonical address, so a pasted link shows
a card in chats and on social sites. The card image is the nearest
`opengraph-image.png` (site-wide, the Hold Labs hub, and one per lab,
generated by `node scripts/make-brand-images.mjs` along with the icons in
`src/app/`). A page that sets its own `openGraph` replaces the layout's
whole block, site name and root image included, so `pageMetadata`
(`src/lib/page-metadata.ts`) sets the site name again on every page, and
a page with no image file of its own (the guide) passes the site image
explicitly; a page with one beside it must not, because an image set in
metadata replaces the file's. Design pages use their first
photo through `/holds/<id>/og`, which serves the card copy from this
origin with a stable address; a signed R2 URL would expire after an hour
and scrapers re-fetch previews later than that. A design without a photo
shows the site image.

The site is verified in Google Search Console
(https://search.google.com/search-console) as a Domain property through a
TXT record on `garageholds.com` in Vercel DNS, with the sitemap submitted.
Page views are recorded by Vercel Web Analytics, enabled on the project
and mounted in `src/app/layout.tsx`; no cookies, so no banner. The clicks
that matter are counted as custom events, listed with their properties in
`src/features/analytics/events.ts`: STL exports, generator errors, and
settings saved or loaded per lab; designs published, saved, and reviewed;
file downloads; sign-in starts by method; feedback and reports sent; gear
link clicks per product; and the tip link. They appear under Events in the
Analytics tab.

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
  and sign one PUT URL per file, bound to the declared size and content type
  (R2 refuses a PUT that sends anything else, so a signed URL cannot be
  reused for a larger object), the browser uploads directly to R2, then the
  server confirms each object's existence and size, marks it ready, and
  publishes. A failure after the draft exists abandons it again.
- `src/features/uploads/lifecycle.ts` is the nightly reconciliation
  described above, run by `src/app/api/sweep/route.ts`; the integration tests
  exercise it on the local stack with an in-memory bucket.
- `src/features/holds/repository.ts` reads designs, reviews, and bookmarks as
  the signed-in user and attaches signed R2 URLs for photos and downloads.
