# The local Supabase stack

The ownership tests in `tests/integration` run against a copy of the
database that the Supabase CLI starts on your laptop with Docker. The same
stack lets you run the app with throwaway accounts and an empty library,
without touching the hosted project. This is a walkthrough to do once by
hand; CI runs the same steps on every push (`.github/workflows/ci.yml`, job
"Ownership tests on a local Supabase stack").

## 1. Install Docker Desktop

Docker runs each service in a container: an isolated process with its own
filesystem, built from an image that is downloaded once. The Supabase CLI
starts and stops those containers for you, so you rarely touch Docker
directly, but it helps to know what is there.

1. Install [Docker Desktop](https://docs.docker.com/desktop/) for your
   operating system and start it. On macOS and Windows it runs a small Linux
   virtual machine that hosts the containers.
2. Settings → Resources: give it at least 2 CPUs and 4 GB of memory. The
   stack idles at around 1 GB.
3. Confirm it works from a terminal:

   ```sh
   docker version      # "Server" section present means the engine is running
   docker run --rm hello-world
   ```

   `run` downloads an image and starts a container from it; `--rm` removes
   the container when it exits. The image stays cached.

## 2. Start the stack

From the repository, after `npm ci`:

```sh
npm run db:start
```

That is `supabase start`. The first run pulls about 2 GB of images (Postgres,
the auth server, the REST API, the API gateway, Studio, a mail catcher) and
takes a few minutes; later starts take seconds. It then applies every file
in `supabase/migrations` in order to a fresh database and prints the local
URLs and keys. `supabase/config.toml` is the stack's configuration: ports,
auth settings, and which services are enabled. Storage, realtime, edge
functions, and analytics are switched off because the app does not use them.

Look at what is running:

```sh
docker ps                       # one line per container, with its image and ports
docker stats --no-stream        # memory and CPU per container
npx supabase status             # the URLs and keys again, any time
```

Container names start with `supabase_`, for example `supabase_db_garage-holds`
is Postgres and `supabase_auth_garage-holds` is the auth server. Postgres
listens on `127.0.0.1:54322` with user and password `postgres`, so any
Postgres client can connect; `npx supabase db --help` lists the CLI's own
database commands. Studio, a web UI for the database, is at
http://127.0.0.1:54323.

## 3. Run the ownership tests

```sh
npm run test:integration
```

The tests read the stack's URL and keys from `supabase status`, create two
confirmed users through the admin API, and then act as each of them (and as
a visitor) through the normal REST API, so every query is subject to the
row-level security policies in the migrations. They check that drafts are
private, that nobody can edit or delete someone else's design, that a
design cannot be published without a verified model file, that reviews and
bookmarks follow the same rules, and that profiles can only be renamed by
their owner and never to a name someone else has. The two users are deleted
afterwards. The suite refuses to run against anything but `127.0.0.1` or
`localhost`.

To see the data in between, run a single test file under the debugger, or
query Postgres directly:

```sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c 'select id, title, status from designs'
```

## 4. Run the app against the local stack

Create `.env.local` from `.env.example` with the local values:

```sh
npx supabase status -o env
```

- `NEXT_PUBLIC_SUPABASE_URL`: `API_URL` (`http://127.0.0.1:54321`)
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: `PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`: `SECRET_KEY`

Leave the `R2_*` variables as they are if you want real uploads, or blank to
see the "uploads aren't configured" state. `npm run dev`, then sign in with
any email address: the local stack never sends mail, so read the code at
http://127.0.0.1:54324 (Mailpit, the mail catcher). Google sign-in is not
configured locally. Each new sign-in gets a fresh profile and lands on
`/welcome` exactly as in production.

## 5. Change the schema

```sh
npx supabase migration new add_something      # creates supabase/migrations/<timestamp>_add_something.sql
npm run db:reset                               # rebuilds the local database from all migrations
npm run db:types                               # regenerates src/lib/supabase/database.types.ts
npm run test:integration
```

`db reset` drops and recreates the local database, so it also proves the
migrations run cleanly from nothing. When the change is right,
`npx supabase db push` applies the new file to the hosted project
(`docs/hosted-setup.md` has the one-time link step). CI fails if the
committed types do not match what the migrations produce.

## 6. Stop and clean up

```sh
npm run db:stop                  # stops the containers, keeps the database state for next time
npx supabase stop --no-backup    # stops and discards the database state
docker system df                 # disk used by images, containers, and volumes
docker image prune               # removes unused image layers
```

A volume is Docker's persistent disk for a container; `db:stop` keeps the
database volume so your local users and designs survive a restart, and
`--no-backup` removes it. Deleting the images (`docker rmi`) only means the
next start downloads them again.

## Troubleshooting

- **"Cannot connect to the Docker daemon"**: Docker Desktop is not running.
- **Port already in use**: another project's stack or a local Postgres is on
  54321–54324. Stop it, or change the ports in `supabase/config.toml`.
- **`supabase start` hangs on a health check**: `docker logs
supabase_db_garage-holds` shows what Postgres is doing; usually memory is
  too low in Docker Desktop's resource settings.
- **A migration fails on `db reset`**: fix the newest, unapplied file. Never
  edit one that has already been applied to the hosted project; add a new
  file instead.
- **Tests say no stack was found**: `npx supabase status` must print URLs.
  Run it from the repository root, where `supabase/config.toml` is.
