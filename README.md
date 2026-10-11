# Garage Holds

A Next.js / React / TypeScript prototype for discovering and sharing 3D printable climbing holds for home walls and training boards.

## Run locally

Requires Node.js 20.9+ and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. Browsing, local uploads, reviews, and saved holds need no credentials. To enable sign-in, copy `.env.example` to `.env.local` and fill in the two public Supabase values; [docs/hosted-setup.md](docs/hosted-setup.md) lists every dashboard setting involved.

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

GitHub Actions runs the same five commands on every pull request and on pushes to `main` (`.github/workflows/ci.yml`), plus the two-user ownership tests in `tests/integration` against a local Supabase stack in Docker; [docs/local-stack.md](docs/local-stack.md) walks through running that stack and `npm run test:integration` on a laptop. `.nvmrc` pins the Node major version CI uses. Lint uses `eslint-config-next` with the TypeScript rules and treats warnings as failures.

## What works

- Search and combined filters for hold type, size, mounting, material, optional special process, and an optional suggested problem grade at 40°. Grades use V0–V1, V2, V3, … V17.
- Model pages with size, mounting, grade suggestions at 40°, printing recipes, optional fuzzy skin / texture notes, and licensing. Normal prints leave special process blank; unusual steps use plain-language labels.
- Upload model files with optional photos and publish them for anyone to download. Skipping photos asks for one friendly confirmation.
- Add photos from your phone: the upload and edit pages show a QR code that opens a page on the phone to take a photo or pick one, and the photos appear on the computer within seconds. The edit page also removes a photo you no longer want.
- Browse multiple photos using arrows on library cards before opening a design's detail page.
- Photo-free designs show an automatically generated STL thumbnail in the library and on detail pages. Photos take priority when provided.
- STL covers start with a low side angle to show the lip and incut. Detail pages offer Side, Other side, End, Other end, and Overview angles. A broad flat outer face is used as a likely mounting surface; irregular meshes fall back to Z-up. Orientation is a best-effort guess, and alternate views help when it guesses incorrectly.
- Save designs to your account and leave one editable review per design with printing settings, material, post-processing, and a suggested problem grade at 40°.
- A feedback dialog in the footer and a "Report this design" link on every design page, both stored and forwarded to the site owner.
- Edit or delete your own designs. Each account has an upload allowance (20 designs, 2 GB by default) that the site owner can raise; "My designs" shows your usage.
- Responsive layouts and keyboard-accessible forms. A generated sitemap and robots file, and Open Graph link previews with the design's first photo.
- Light and dark themes follow your system initially; the header toggle remembers your choice in this browser.
- Uploads finish with an in-place confirmation and explicit actions to view the design or add another. Saving never silently redirects or clears the form on failure, and a failed upload leaves no half-finished draft behind.
- Upload validation explains missing fields beside the submit button, including the 20-character description minimum. It preserves the form and avoids the browser's automatic jump to an invalid field.

Eight sample entries use SVG illustrations and fictional metadata. They contain no printable files or fabricated community reviews.

## Shared library

Designs, reviews, and saved holds live in Supabase Postgres; model files and photos live in a private Cloudflare R2 bucket. Browsing and downloads are open to everyone; uploading, reviewing, and saving need an account. Uploads go from the browser straight to R2 with signed URLs, and a design is published only after the server has confirmed every file exists with its declared size. Download and photo links are signed and expire after an hour.

Ownership is enforced in the database with row-level security keyed on the immutable user id. Drafts are visible only to their owner. Each person can leave one review per design and edit it. The `crux-theme` preference key is retained so existing theme choices survive.

Supported model uploads: STL, 3MF, STEP/STP, OBJ, PLY, glTF/GLB, IGES/IGS, F3D, BLEND, SCAD, and ZIP. Up to 10 files, 100 MB per file; optionally up to 6 JPG/PNG/WebP photos, 10 MB per photo; 200 MB total. Files are stored and downloaded unchanged, always as attachments with the creator's filename. ASCII and binary STLs up to 25 MB and 500,000 triangles can produce static previews, using the first STL when a design has several files. Other formats, invalid STLs, and unavailable browser graphics show a placeholder while downloads remain available. Previews load near the viewport and additional angles render only when selected. Jobs run one at a time and cache up to 32 images by file and angle. Cameras fit each visible silhouette; choosing an orientation never changes the geometry or the original file. Geometry and graphics resources are released after each render.

## Code map

- `src/app`: thin Next.js routes, page metadata, global styles.
- `src/features/holds`: domain types, sample data, filtering, validation, row mapping, the server-side repository, catalog and detail UI.
- `src/features/uploads`: upload form, file picker, the three-step upload pipeline (draft → signed PUT to R2 → verify and publish), the phone photo hand-off behind `/phone/<session>`, and the storage sweep behind `/api/sweep`.
- `src/features/reviews`: review UI.
- `src/features/auth`: sign-in, sign-out, account menu, and display-name editing.
- `src/features/feedback`: the bug report, feedback, and design report dialog.
- `src/features/profiles`: display-name rules shared by the form and the server.
- `src/components`: shared UI and library state.
- `src/lib/r2.ts`: signed URLs and object checks against Cloudflare R2; credentials never leave the server.
- `src/lib/supabase`: request-bound Supabase clients for Server Components, Server Functions, and the proxy, plus the server-only admin client used to record verified files.
- `tests`: domain behavior tests; `tests/integration` runs the row-level security policies with two users on the local Supabase stack.
- `supabase/migrations`: the schema, applied in order by the Supabase CLI. `supabase/config.toml` configures the local stack; `src/lib/supabase/database.types.ts` is generated from it with `npm run db:types`.

## Accounts

Sign-in uses Supabase Auth with email one-time codes and Google. `src/features/auth` holds the server functions, forms, and the header menu; `src/lib/supabase` holds the request-bound clients; `src/proxy.ts` refreshes sessions on each navigation. Every user gets one profile (`supabase/migrations/`) keyed by their immutable user id, with a unique display name and optional bio. The first sign-in lands on `/welcome` to confirm the name; `/account` edits it later. Uploading, reviewing, and saving require a signed-in account with a finished profile.

## Hosted integration next

The intended hosted stack is Next.js, Supabase Postgres/Auth, and Cloudflare R2. Do not add service credentials to browser code.

See [the implementation plan](docs/next-milestone.md) for the first complete hosted flow, focused cleanup, and ownership tests, and [docs/hosted-setup.md](docs/hosted-setup.md) for the external configuration.

1. Replace a design's model files.
2. Moderation/reporting, pagination, and search in the database before public launch.
3. Extend static STL previews with interactive viewing and more formats when needed. Geometry processing can use a Python worker when justified.
4. Introduce Stripe Connect/Billing and access entitlements when bundles and subscriptions are in scope.

The schema has not had a production security audit. Edits, deletion, revisions, paid downloads, subscriptions, and interactive 3D viewing are not implemented.

Recipes and grades are creator/community reports. They are not certifications of hold strength; sample recommendations are illustrative.

## Implementation conventions

Keep business rules in ordinary TypeScript, validate inputs at the trusted boundary, and put database changes in migrations. Prefer small feature modules and explicit data flow. Add abstractions and dependencies only for current requirements. Test permissions, filters, uploads, and other consequential behavior rather than component internals.
