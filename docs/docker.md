# Docker & Docker Compose

## The problem

Running this project locally requires installing Node, Postgres, and Redis separately, running `npm install` in two folders, setting the correct env vars, and starting each service in the right order. One wrong version or missing env var and nothing works.

## How Docker works

```
Dockerfile  →  (docker build)  →  Image  →  (docker run)  →  Container
```

- **Dockerfile** — the instructions you write telling Docker how to build your app
- **Image** — the built result, a frozen snapshot sitting on disk
- **Container** — a live, running instance of that image

The same image can be run as many containers simultaneously. `docker compose up` automates the build and run steps for all services at once.

## The solution: containers

Docker packages each piece of the app into a self-contained **container** — a lightweight, isolated environment that has everything it needs to run. Docker Compose defines all the containers in one file and starts them together with a single command.

```
docker compose up --build
```

That one command installs dependencies, compiles TypeScript, builds the frontend, starts Postgres, starts Redis, and wires everything together.

## Services

The project runs four containers, plus the code sandbox during local development:

```
┌─────────────┐     ┌─────────────┐
│  frontend   │────▶│   backend   │
│  (nginx:80) │     │  (node:4000)│
└─────────────┘     └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
       ┌─────────────┐          ┌─────────────┐
       │  postgres   │          │    redis    │
       │  (port 5432)│          │  (port 6379)│
       └─────────────┘          └─────────────┘
```

| Container  | Image              | Port | Purpose                 |
|------------|--------------------|------|-------------------------|
| frontend   | nginx:alpine       | 80   | Serves the React app    |
| backend    | node:20-alpine     | 4000 | Express API + Socket.IO |
| postgres   | postgres:16-alpine | 5432 | Primary database        |
| redis      | redis:alpine       | 6379 | Job queue + cache       |
| piston     | ghcr.io/engineer-man/piston | 2000 (localhost only) | Code sandbox — `local` profile only |

## Profiles: services that only run sometimes

The `piston` service (the code sandbox) has `profiles: ["local"]`. A service with a profile is **skipped** by a plain `docker compose up` and only starts when that profile is asked for:

```bash
docker compose up -d                          # postgres, redis, backend, frontend
docker compose --profile local up -d piston   # also the sandbox
```

This lets one compose file serve two machines: a developer laptop runs the sandbox, while the ARM deploy server (which Piston has no image for) never downloads it.

Two other settings on `piston` matter for security:

- `ports: "127.0.0.1:2000:2000"` publishes the port on the loopback interface only. Without the `127.0.0.1`, anyone on the internet could send code straight to the sandbox and skip the backend's rate limit.
- `privileged: true` is required by Piston to build its per-run sandboxes. Privileged containers effectively have root on the host, which is why only the official image is used.

## Database tables are not created automatically

The `postgres` container starts with an **empty** database. Create (or update) the tables by piping the schema into it:

```bash
docker exec -i postgres psql -U postgres -d freeformcode < backend/db/schema.sql
```

`schema.sql` uses `CREATE TABLE IF NOT EXISTS` plus `ALTER TABLE ... IF NOT EXISTS` migrations, so it is safe to run again after pulling changes.

## Multi-stage builds

Both the backend and frontend Dockerfiles use a **multi-stage build** to keep the final image small and clean.

```
Stage 1 (builder)          Stage 2 (runtime)
──────────────────         ──────────────────
Install all deps     ───▶  Install prod deps only
Compile TypeScript         Copy compiled dist/
                           No source code, no dev tools
```

The image that runs in production contains no TypeScript, test tools, or dev dependencies — only what is needed to run.

## Credentials and .dockerignore

The `.env` file holds real credentials (DB password, secrets). Two layers of protection keep it out of the wrong places:

| File | Protects against |
|---|---|
| `.gitignore` | `.env` never gets committed to GitHub |
| `.dockerignore` | `.env` never gets copied into the Docker image |

Both are required — they serve different tools and do not share rules.

Credentials are injected at **runtime** by Docker Compose via `env_file`, not baked into the image at build time:

```yaml
backend:
  env_file:
    - ./backend/.env   # loaded when the container starts, not when the image is built
  environment:
    DB_HOST: postgres  # overrides DB_HOST=localhost from .env to use the container name
```

## Container networking

Containers communicate using their **service name** as the hostname, not `localhost`. Docker Compose sets up a private network between them automatically.

```
# Wrong inside a container
DB_HOST=localhost

# Correct — "postgres" is the service name defined in docker-compose.yml
DB_HOST=postgres
```

`docker-compose.yml` overrides `DB_HOST` to `postgres` because `localhost` only works when running the backend outside of Docker.

## File structure

```
free-form-Code/
├── backend/
│   ├── Dockerfile        # builds the Node/TypeScript API
│   └── .dockerignore     # excludes node_modules, dist, .env from the build
├── my-app/
│   ├── Dockerfile        # builds the React/Vite frontend
│   ├── nginx.conf        # SPA routing + /api and /socket.io proxy rules
│   └── .dockerignore     # excludes node_modules, dist, .env from the build
└── docker-compose.yml    # orchestrates the services (piston behind the "local" profile)
```
