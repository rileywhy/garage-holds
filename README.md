# Garage Holds

A Next.js / React / TypeScript prototype for discovering and sharing 3D printable climbing holds for home walls and training boards.

## Run locally

Requires Node.js 20.9+ and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. No credentials are needed for the prototype.

```sh
npm run format:check
npm run typecheck
npm test
npm run build
```

GitHub Actions runs the same four commands on every pull request and on pushes to `main` (`.github/workflows/ci.yml`). `.nvmrc` pins the Node major version CI uses.

## What works

- Search and combined filters for hold type, size, mounting, material, optional special process, and an optional suggested problem grade at 40°. Grades use V0–V1, V2, V3, … V17.
- Model pages with size, mounting, grade suggestions at 40°, printing recipes, optional fuzzy skin / texture notes, and licensing. Normal prints leave special process blank; unusual steps use plain-language labels.
- Upload model files with optional photos, then download the original files. Skipping photos asks for one friendly confirmation.
- Browse multiple photos using arrows on library cards before opening a design's detail page.
- Photo-free designs show an automatically generated STL thumbnail in the library and on detail pages. Photos take priority when provided.
- STL covers start with a low side angle to show the lip and incut. Detail pages offer Side, Other side, End, Other end, and Overview angles. A broad flat outer face is used as a likely mounting surface; irregular meshes fall back to Z-up. Orientation is a best-effort guess, and alternate views help when it guesses incorrectly.
- Save designs and leave reviews with printing settings, material, post-processing, and a suggested problem grade at 40°.
- Responsive layouts and keyboard-accessible forms.
- Light and dark themes follow your system initially; the header toggle remembers your choice in this browser.
- Uploads finish with an in-place confirmation and explicit actions to view the design or add another. Saving never silently redirects or clears the form on failure.
- Upload validation explains missing fields beside the submit button, including the 20-character description minimum. It preserves the form and avoids the browser's automatic jump to an invalid field.

Eight sample entries use SVG illustrations and fictional metadata. They contain no printable files or fabricated community reviews.

## Local storage boundary

Uploads, photo blobs, original model files, reviews, and bookmarks persist in IndexedDB on this browser and origin. They do not sync to another browser, computer, or port. Clearing site data removes them. Browser quota and eviction policies still apply; keep the original files elsewhere. Display names are unverified, and there is no public publishing or account system yet.

The original `crux-library` database name and `crux-theme` preference key are retained so the Garage Holds rename preserves existing uploads, bookmarks, reviews, and theme choices.

Saving a design and its assets happens in one IndexedDB transaction. The UI updates only after a successful transaction. Reload to see changes made in a different tab.

Supported model uploads: STL, 3MF, STEP/STP, OBJ, PLY, glTF/GLB, IGES/IGS, F3D, BLEND, SCAD, and ZIP. Up to 10 files, 100 MB per file; optionally up to 6 JPG/PNG/WebP photos, 10 MB per photo; 200 MB total. Files are stored and downloaded unchanged. ASCII and binary STLs up to 25 MB and 500,000 triangles can produce static previews, using the first STL when a design has several files. Other formats, invalid STLs, and unavailable browser graphics show a placeholder while downloads remain available. Previews load near the viewport and additional angles render only when selected. Jobs run one at a time and cache up to 32 images by file and angle. Cameras fit each visible silhouette; choosing an orientation never changes the geometry or the original file. Geometry and graphics resources are released after each render.

## Code map

- `src/app`: thin Next.js routes, page metadata, global styles.
- `src/features/holds`: domain types, sample data, filtering, validation, catalog and detail UI.
- `src/features/uploads`: upload form and file picker.
- `src/features/reviews`: review UI.
- `src/components`: shared UI and library state.
- `src/lib/local-repository.ts`: browser persistence; no storage details in the page components.
- `tests`: domain behavior tests.
- `supabase/migrations`: initial proposed hosted schema, not applied by the prototype.

## Hosted integration next

The intended hosted stack is Next.js, Supabase Postgres/Auth, and Cloudflare R2. `.env.example` documents the intended configuration but is not consumed yet. Do not add service credentials to browser code.

The next milestone uses email codes and Google sign-in. See [the implementation plan](docs/next-milestone.md) for the first complete hosted flow, focused cleanup, and ownership tests.

1. Review the upload fields and hosted schema, then create Supabase and R2 projects.
2. Add verified authentication; move shared records to Supabase with tested row-level security.
3. Add server-issued signed R2 upload/download URLs. Validate size, type, ownership, and upload completion server-side; do not trust browser validation or declared MIME types. Reconcile abandoned uploads and deleted records with object storage.
4. Add ownership-based edit/delete controls, file revisions, moderation/reporting, and pagination before public launch.
5. Extend static STL previews with interactive viewing and more formats when needed. Geometry processing can use a Python worker when justified.
6. Introduce Stripe Connect/Billing and access entitlements when bundles and subscriptions are in scope.

The hosted migration is a starting point, not a production security audit. Accounts, public sharing, edits/deletion, revisions, paid downloads, subscriptions, and interactive 3D viewing are not implemented. The local prototype should not be presented as a multi-user upload service.

Recipes and grades are creator/community reports. They are not certifications of hold strength; sample recommendations are illustrative.

## Implementation conventions

Keep business rules in ordinary TypeScript, validate inputs at the trusted boundary, and put database changes in migrations. Prefer small feature modules and explicit data flow. Add abstractions and dependencies only for current requirements. Test permissions, filters, uploads, and other consequential behavior rather than component internals.
