# free-form

An infinite canvas where you can write and run code freely — inspired by Excalidraw. Drop code blocks anywhere on the canvas, run them in JavaScript, Python, C++ or Java, and collaborate on the same canvas in real time.

## Features

- **Infinite canvas** — drag, drop, and arrange code blocks anywhere; draw and erase freehand
- **Multi-language code execution** — JavaScript, Python, C++ and Java, each block remembers its language
- **Sandboxed runs** — user code never runs inside the backend; it runs in an isolated sandbox (Piston) with no network access and time limits
- **Real-time collaboration** — edits, moves and language changes sync across clients via Socket.IO
- **Job queue** — code runs go through a BullMQ queue so the server stays stable under load
- **Canvas sharing** — share a view-only link, or an edit link for collaborators
- **Guest mode** — try the app without an account (one canvas); signing up later keeps that canvas
- **Authentication** — sign up, log in, and manage multiple canvases from a dashboard
- **Dark / light mode**

## Tech Stack

| Layer          | Technology                                           |
|----------------|------------------------------------------------------|
| Frontend       | React 19, TypeScript, Vite, Tailwind CSS, CodeMirror |
| Backend        | Node.js, Express, TypeScript, Socket.IO, Zod         |
| Database       | PostgreSQL                                           |
| Queue / Cache  | Redis, BullMQ                                        |
| Code sandbox   | Piston (self-hosted, local development)              |
| Infrastructure | Docker, Docker Compose, nginx, GitHub Actions        |

## Database Schema

Defined in [`backend/db/schema.sql`](backend/db/schema.sql).

| Table      | Key columns                                                                 |
|------------|-----------------------------------------------------------------------------|
| `users`    | `id`, `username`, `email` (null for guests), `password_hash` (null for guests), `is_guest` |
| `canvases` | `id`, `user_id` → users, `name`, `share_id`, `is_public`                    |
| `blocks`   | `id`, `canvas_id` → canvases, `type` (text/code/draw), `language`, `content`, `x`, `y`, `width` |

Deleting a user deletes their canvases, and deleting a canvas deletes its blocks (`ON DELETE CASCADE`).

## Prerequisites

**To run with Docker (recommended):**
- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/) (included with Docker Desktop)

**To run locally without Docker:**
- Node.js 20+
- PostgreSQL
- Redis
- Docker (only for the code sandbox)

## Running the App

### With Docker (recommended)

1. Clone the repo:
   ```bash
   git clone https://github.com/rcjasub/free-form-Code.git
   cd free-form-Code
   ```

2. Create the backend env file:
   ```bash
   cp backend/.env.example backend/.env
   ```
   Fill in the values (see [Environment Variables](#environment-variables)).

3. Start everything:
   ```bash
   docker compose up --build
   ```

4. Create the database tables (first run only — safe to re-run after pulling schema changes):
   ```bash
   docker exec -i postgres psql -U postgres -d freeformcode < backend/db/schema.sql
   ```

5. Open [http://localhost](http://localhost) in your browser.

To stop:
```bash
docker compose down
```

---

### Without Docker (local dev)

1. Install dependencies:
   ```bash
   cd backend && npm install
   cd ../my-app && npm install
   ```

2. Make sure PostgreSQL and Redis are running locally, then create `backend/.env` (see below) and the tables:
   ```bash
   psql -U postgres -d freeformcode -f backend/db/schema.sql
   ```

3. Start the code sandbox and install its languages (first time only — see [Code Sandbox](#code-sandbox)):
   ```bash
   docker compose --profile local up -d piston
   sh backend/scripts/install-piston-languages.sh
   ```

4. Start both servers from the `my-app` folder:
   ```bash
   npm run dev
   ```

   This starts the backend on `http://localhost:4000` and the frontend on `http://localhost:5173`.

## Environment Variables

Create `backend/.env` with the following:

```env
PORT=4000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=freeformcode
DB_USER=postgres
DB_PASSWORD=yourpassword

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your_jwt_secret

# Frontend origin (for CORS)
CLIENT_URL=http://localhost:5173

# Code sandbox — leave unset to disable code running
PISTON_URL=http://localhost:2000
```

> When running with Docker, `DB_HOST` and `REDIS_URL` are overridden automatically by `docker-compose.yml` to use the container service names.

## Code Sandbox

Code runs in [Piston](https://github.com/engineer-man/piston), a self-hosted execution engine that runs each submission in an isolated box with no network access, a 3-second run limit and a 10-second compile limit.

- Piston is in the `local` Compose profile, so a plain `docker compose up` does **not** start it. Start it with `docker compose --profile local up -d piston`.
- Its port is bound to `127.0.0.1`, so only the local machine can reach it — clients go through the backend's rate-limited `/api/run`.
- **Code running is off whenever `PISTON_URL` is unset.** Run then replies "Code running isn't available yet." instead of executing anything, so a server without a sandbox fails safe.
- Piston has no official ARM image, which is why the deployed ARM server doesn't run it (see [Deployment](#deployment)).
- The language runtimes take about 6 GB of disk. `docker compose --profile local down -v` removes them.

## Deployment

The app is deployed on an Oracle Cloud free-tier VM (ARM, Ampere A1) with Docker Compose.

```bash
git pull
docker compose up -d --build
docker exec -i postgres psql -U postgres -d freeformcode < backend/db/schema.sql  # after schema changes
```

On the VM, `PISTON_URL` is left unset, so code running is disabled there until an ARM-compatible sandbox is in place. `CLIENT_URL` must be set to the exact origin users open (IP or domain), or the browser will block API requests via CORS.

## Project Structure

```
free-form-Code/
├── backend/
│   ├── controllers/        # Route handlers (auth, canvas, blocks, run)
│   ├── routes/             # Express route definitions
│   ├── models/             # Database queries
│   ├── middleware/         # Auth, canvas access checks, request validation
│   ├── schemas/            # Zod request/socket schemas
│   ├── db/schema.sql       # Tables + idempotent migrations
│   ├── scripts/            # install-piston-languages.sh
│   ├── queue.ts            # BullMQ job queue setup
│   ├── worker.ts           # Queue worker (hands code to the sandbox)
│   ├── sandbox.ts          # Piston client; code running is off without PISTON_URL
│   ├── redis.ts            # Redis clients + cache helpers
│   ├── socket.ts           # Socket.IO setup
│   ├── server.ts           # Entry point
│   └── Dockerfile
├── my-app/
│   ├── src/
│   │   ├── pages/          # Dashboard, Home (login / guest), SharedCanvas
│   │   ├── components/     # UI components (FloatingNode, DrawingNode, etc.)
│   │   ├── lib/            # languages, runCode, sockets, shape detection
│   │   ├── API/            # Axios API calls
│   │   └── hooks/          # Custom React hooks
│   ├── nginx.conf          # Serves SPA + proxies /api and /socket.io to backend
│   └── Dockerfile
├── docs/
│   ├── docker.md               # Docker concepts and setup explained
│   ├── redis-and-queues.md     # Queue, caching and sandbox architecture
│   ├── github-actions.md       # CI/CD workflows explained
│   └── engineering-notes.md    # Problems hit while building this, and how they were solved
└── docker-compose.yml          # Orchestrates the services
```

## How Code Execution Works

When a user clicks Run, the code is never executed by the backend itself:

1. The frontend sends the code, its language, its `socketId` and a `runId` to `/api/run` (rate-limited, validated with Zod)
2. Express adds the job to a BullMQ queue backed by Redis and responds immediately
3. The worker sends the code to the Piston sandbox, which compiles/runs it in isolation
4. The result is sent back to that user via Socket.IO, tagged with the `runId` so each output lands next to the block that produced it

See [docs/redis-and-queues.md](docs/redis-and-queues.md) for the full breakdown.
