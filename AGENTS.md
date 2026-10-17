<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project conventions

Maintainability takes priority over feature count. Keep routes thin, group code by feature, and put business rules in plain TypeScript. Avoid speculative abstractions and dependencies. Keep source consistently formatted with `npm run format`.

Data lives in Supabase (accounts, designs, reviews, bookmarks) and Cloudflare R2 (files). Reads and user writes go through the signed-in user's client so row-level security is the authority; the service-role client in `src/lib/supabase/admin.ts` is used only to record facts users cannot assert, such as a verified upload. Never bind or trust browser-declared sizes or types: the server re-validates and checks R2 before publishing. Schema changes are timestamped files in `supabase/migrations`, applied in order by the Supabase CLI and never edited once applied; `src/lib/supabase/database.types.ts` is generated from them (`npm run db:types`), never edited by hand. The app must keep running without any of the environment variables set (accounts and uploads degrade to "not configured").

Run focused domain tests, type checking, and a production build for consequential changes. Verify interactive changes in the browser. Never commit secrets or expose server credentials in browser code.

`main` is protected and every commit on it deploys to production. Work on a branch, open a pull request, and merge once the "CI passed" check is green; never try to push to `main` directly (see "Merging to main" in `docs/hosted-setup.md`).
