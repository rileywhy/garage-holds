# Hosted setup

What has to be configured outside this repo for accounts to work, and where
each value goes. Nothing here is secret except where marked.

## Environment variables

| Variable                               | Where it is used | Secret? | Where to find it                                                                        |
| -------------------------------------- | ---------------- | ------- | --------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Browser + server | No      | Supabase dashboard → Project Settings → API → Project URL                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + server | No      | Supabase dashboard → Project Settings → API Keys → Publishable key (`sb_publishable_…`) |
| `R2_ACCOUNT_ID`                        | Server only      | No      | Cloudflare dashboard → R2 → account id (right sidebar)                                  |
| `R2_ACCESS_KEY_ID`                     | Server only      | **Yes** | Cloudflare → R2 → Manage R2 API Tokens → create a token scoped to the bucket            |
| `R2_SECRET_ACCESS_KEY`                 | Server only      | **Yes** | Shown once when the R2 token is created                                                 |
| `R2_BUCKET_NAME`                       | Server only      | No      | The bucket you created                                                                  |

Locally these go in `.env.local` (git-ignored). On Vercel they go in Project →
Settings → Environment Variables. Secrets never go in chat, commits, or
`NEXT_PUBLIC_*` names. The Supabase **secret** key is not needed by the app at
all; the server acts as the signed-in user and row-level security does the rest.

Without the two Supabase variables the app still runs: the header shows no
account menu and `/sign-in` explains that accounts are not configured.

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

   - Default OTP length is 6 digits and expiry is 1 hour. Both are fine.
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
