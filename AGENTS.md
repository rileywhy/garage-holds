<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project conventions

Maintainability takes priority over feature count. Keep routes thin, group code by feature, and put business rules in plain TypeScript. Avoid speculative abstractions and dependencies. Keep source consistently formatted with `npm run format`.

Uploads, reviews, and saved holds are still browser-local; do not imply they are publicly shared. Accounts (Supabase Auth: email codes and Google) are wired up in `src/features/auth` and `src/lib/supabase`, and run only when the public Supabase variables are set. R2 is not wired up yet. Before enabling public uploads, implement and test authorization, trusted file validation, and storage lifecycle handling. Schema changes are numbered files in `supabase/migrations`; `supabase/proposed-library.sql` is a draft, not a migration.

Run focused domain tests, type checking, and a production build for consequential changes. Verify interactive changes in the browser. Never commit secrets or expose server credentials in browser code.
