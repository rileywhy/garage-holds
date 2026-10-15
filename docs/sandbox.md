# Local Windows sandbox

A checkout of this repository on a Windows machine, with the app and the
four hold-lab generators running on loopback addresses and no production
credentials anywhere near it.

## Start and stop

From PowerShell in the repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-sandbox.ps1
```

Open http://127.0.0.1:3000. The command starts the four Python API services
and the Next.js development server. Source edits reload automatically.
Press Ctrl+C in that terminal to stop; the script cleans up its Python processes.
Stop the existing sandbox before starting another copy.

The ignored `.env.local` points the labs at loopback addresses (the commented
lines at the end of `.env.example` are these):

| Service    | Address                          |
| ---------- | -------------------------------- |
| Next.js    | http://127.0.0.1:3000            |
| Crimp API  | http://127.0.0.1:8766/api/crimp  |
| Sloper API | http://127.0.0.1:8771/api/sloper |
| Jug API    | http://127.0.0.1:8781/api/jug    |
| Foot API   | http://127.0.0.1:8785/api/foot   |

The Custom Shape Lab's generator is a Next.js route (`/api/custom-shape`)
that runs the Python in `tools/custom-shape-generator`; its own GUI starts
with `tools/custom-shape-generator/run.ps1`.

Dependencies are installed in `node_modules` and `.venv`; both are ignored by Git.
Use the Node version in `.nvmrc` (what CI runs) and Python 3.12 or newer.

To rebuild the environments if needed:

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r tools/crimp-generator/requirements.txt
```

All four hold generators share the same pinned Python dependencies.

## What you can test

The app shell, themes, responsive layouts, printing guide, lab controls,
geometry previews, and exports run locally. No production credentials are
configured. The library is empty, accounts are disabled, and publishing,
reviews, bookmarks, and phone photo uploads require backend configuration.

With Docker Desktop installed, [local-stack.md](local-stack.md) starts a local
Supabase database for accounts and the ownership integration tests. Use only
the local Supabase keys in `.env.local`. File publishing additionally
requires a separate development R2 bucket and its credentials; the repository
does not provide a local R2 emulator. Never copy production credentials into
this sandbox.

## Code map and analysis

- `src/app`: Next.js App Router pages, metadata, styles, and API routes.
- `src/features`: domain rules and UI for holds, uploads, auth, reviews, feedback,
  model viewing, and the hold labs.
- `src/lib/supabase`: request-bound clients, generated database types, and the
  server-only admin client. Database row-level security enforces ownership.
- `src/lib/r2.ts`: signed object URLs and server-side file verification.
- `supabase/migrations`: ordered schema and security policy changes.
- `api/*.py` and `tools/*-generator`: hosted handlers and shared geometry engines.
- `tests` and `tools/*-generator/tests`: domain and geometry tests.

The feature-based structure keeps routes small and centralizes validation.
Uploads follow draft creation, signed file upload, then server verification
before publishing. The main testing gap in this setup is backend integration,
which needs Docker and isolated object storage.

## Baseline verification

Passed on initial setup:

- `npm run format:check`, `npm run lint`, `npm run typecheck`.
- `npm test`: 59 tests.
- `npm run build`.
- Python unittest discovery: crimp 29, sloper 21, jug 18 tests.
- HTTP 200 responses for `/`, all three lab pages, `/sign-in`, `/upload`, and
  all three API schemas; all three default geometry preview POSTs succeeded.

Browser interaction has not been verified; HTTP checks do not establish
WebGL rendering or visual correctness.

`npm audit` reported five high-severity affected packages in the development
ESLint dependency chain, rooted in `braces`. Its suggested forced fix changes
the Next.js ESLint config major version. Dependencies were left at the locked
versions; evaluate a compatible upstream fix separately.

Run the Python checks with:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tools/crimp-generator/tests
.\.venv\Scripts\python.exe -m unittest discover -s tools/sloper-generator/tests
.\.venv\Scripts\python.exe -m unittest discover -s tools/jug-generator/tests
.\.venv\Scripts\python.exe -m unittest discover -s tools/foot-generator/tests
```
