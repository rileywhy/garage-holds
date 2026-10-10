<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project conventions

Maintainability takes priority over feature count. Keep routes thin, group code by feature, and put business rules in plain TypeScript. Avoid speculative abstractions and dependencies. Keep source consistently formatted with `npm run format`.

The current app is a browser-local prototype. Do not imply that uploads are publicly shared or display names are verified. Supabase/R2 environment variables and the proposed migration are not wired up yet. Before enabling public uploads, implement and test authentication, authorization, trusted file validation, and storage lifecycle handling.

Run focused domain tests, type checking, and a production build for consequential changes. Verify interactive changes in the browser. Never commit secrets or expose server credentials in browser code.
