# free-form

**An AI architecture visualizer that turns a GitHub repo into a diagram you can edit.** Paste a repo URL and Claude maps the codebase into sections and connections, drawn as boxes and arrows on a real-time collaborative canvas.

> **Status:** the collaborative canvas and the AI diagrams both work locally. The AI generation isn't deployed yet; see the [Roadmap](#roadmap).

## Why

Getting to know an unfamiliar codebase means reading dozens of files before the big picture appears, and a generated diagram is usually a static image: when it gets something wrong, you can't fix it. Here the diagram is the workspace. A team can move, relabel and correct what the AI drew, together and live.

## How it works

1. Paste a GitHub repo URL in **Visualize repo** and pick a model (Sonnet by default, Opus for a more careful diagram). Every diagram is detailed: the main parts and their pieces, about 15–40 boxes. While it works, the dialog shows each step as it runs.
2. The backend reads the repo's file tree and key files (manifests, README, routes, schema, Docker config) at one commit.
3. Claude returns a structured model of the architecture: its sections (each with a kind, a shape for its job, a summary and its files), the connections between them, and a few guided flows through them.
4. Zod validates that model against a schema. Mistakes the AI can make are cleaned up (file paths that don't exist are dropped) or sent back to it once to fix; a response that still breaks the rules becomes a clean error.
5. A layout engine (ELK) positions everything, left to right, with right-angled arrows routed around the boxes. The AI never picks coordinates.
6. The sections and connections appear on the canvas as ordinary shapes and arrows, editable and synced to everyone in the room.

The Anthropic API key is the server's own: `ANTHROPIC_API_KEY` in `backend/.env` (see [Environment Variables](#environment-variables)). It's read per request and never sent to the browser or logged.

## Roadmap

| Phase | Status |
|---|---|
| Shapes, arrows and colors | Done |
| Canvas polish: group resize, smooth drags, multi-block copy | Done |
| AI generates the architecture diagram from a repo | Done (not deployed yet) |
| A chat attached to each section, grounded in that section's code | Planned |
| Feature proposals, showing new and changed parts as an animated diff | Planned |

## Features available today

- **AI architecture diagrams** — paste a GitHub repo and get an editable diagram of it:
  - each part is a hand-drawn tile with an icon for its kind (frontend, backend, service, database, infrastructure, outside service, people) and its name underneath; its shape says its job: a circle where things start, a diamond for what passes traffic on, a rounded square for what does the work
  - parts nested in another (an auth module in the API) sit in a group frame that carries them when dragged; arrows inside a group stay hidden until one of its parts is clicked
  - click a part for its summary, its files (linked to GitHub at the commit that was read) and what it connects to; the rest of the diagram dims and its arrows show data flowing
  - **How it works** plays guided flows ("A user signs in") step by step across the diagram
  - a key explains the colors and shapes, and arrow labels show on hover (or always)
- **Diagramming** — rectangles, diamonds, ellipses and arrows that stay attached as shapes move, with a properties panel for color, fill, line style and opacity
- **Infinite canvas** — drag and arrange blocks anywhere; draw and erase freehand
- **Group editing** — select many blocks, then move, resize, copy, cut, paste or duplicate them together
- **Code blocks** — write and run JavaScript, Python, C++ and Java; each block remembers its language
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
| AI             | Claude API (Sonnet 5.5 by default, Opus 5.5)         |
| Diagram layout | ELK (elkjs)                                          |
| Code sandbox   | Piston (self-hosted, local development)              |
| Infrastructure | Docker, Docker Compose, nginx, GitHub Actions        |

## Database Schema

Defined in [`backend/db/schema.sql`](backend/db/schema.sql), which the backend runs on every startup (`db/migrate.ts`); every statement is safe to re-run.

| Table      | Key columns                                                                 |
|------------|-----------------------------------------------------------------------------|
| `users`    | `id`, `username`, `email` (null for guests), `password_hash` (null for guests), `is_guest` |
| `canvases` | `id`, `user_id` → users, `name`, `share_id`, `is_public`                    |
| `blocks`   | `id`, `canvas_id` → canvases, `type` (text/code/draw/image/shape/arrow), `language`, `content`, `x`, `y`, `width` |
| `architectures` | `id`, `canvas_id` → canvases, `repo_url`, `commit_sha`, `model` (the AI's validated model, as JSON), `created_at` |

Deleting a user deletes their canvases, and deleting a canvas deletes its blocks and architectures (`ON DELETE CASCADE`). Shapes and arrows keep their geometry and style as JSON in `content`. A canvas keeps its 5 latest architectures (the models behind its diagrams); the newest is the current one, used for the guided flows, and older ones are pruned.

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

4. Open [http://localhost](http://localhost) in your browser.

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

2. Make sure PostgreSQL and Redis are running locally, then create `backend/.env` (see below). The backend creates and updates the tables itself on startup (it runs `backend/db/schema.sql`).

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

# AI diagrams ("Visualize repo") — the server's Anthropic API key.
# Leave unset to disable them: the dialog then says the key is missing.
ANTHROPIC_API_KEY=
```

> `backend/.env` is git-ignored, so the API key stays on the machine. Restart the backend after changing it.

> When running with Docker, `DB_HOST` and `REDIS_URL` are overridden automatically by `docker-compose.yml` to use the container service names.

## Code Sandbox

Code runs in [Piston](https://github.com/engineer-man/piston), a self-hosted execution engine that runs each submission in an isolated box with no network access, a 3-second run limit and a 10-second compile limit.

- Piston is in the `local` Compose profile, so a plain `docker compose up` does **not** start it. Start it with `docker compose --profile local up -d piston`.
- Its port is bound to `127.0.0.1`, so only the local machine can reach it — clients go through the backend's rate-limited `/api/run`.
- **Code running is off whenever `PISTON_URL` is unset.** Run then replies "Code running isn't available yet." instead of executing anything, so a server without a sandbox fails safe.
- Piston has no official ARM image, which is why the deployed ARM server doesn't run it (see [Deployment](#deployment)).
- The language runtimes take about 6 GB of disk. `docker compose --profile local down -v` removes them.

## Testing

| Suite | Tool | What it covers | Run it |
|---|---|---|---|
| Frontend unit | Vitest + React Testing Library | Canvas math, shapes, undo history, snapping | `cd my-app && npm test` |
| Backend unit | Jest | Controllers, validation, access checks, sockets | `cd backend && npm test` |
| End-to-end | Playwright | The real app in a real browser: guest canvases, shapes and labels, arrows, undo, two tabs collaborating live, persistence, signing up and deleting an account, and AI diagrams (with the AI's answer faked in the browser, so no key is needed and nothing is billed) | `cd e2e && npm test` |

The end-to-end tests run against a live stack. Locally, start Postgres and Redis (`docker compose up -d postgres redis`), then `npm test` in `e2e/`: it reuses `npm run dev` if it's already running, or starts the backend and frontend itself. The first time, install the browser with `npx playwright install chromium`. Each run signs up throwaway `e2e_…` accounts and deletes them again at the end. Sign-up, sign-in and account deletion share a limit of 10 per 2 minutes per IP and a run uses 6, so running the suite twice within 2 minutes can fail with "Too many attempts".

All three suites run in CI on every pull request ([`.github/workflows/node.js.yml`](.github/workflows/node.js.yml)).

## Deployment

The app is deployed on an Oracle Cloud free-tier VM (ARM, Ampere A1) with Docker Compose.

```bash
git pull
docker compose up -d --build  # the backend applies backend/db/schema.sql on startup
```

On the VM, `PISTON_URL` is left unset, so code running is disabled there until an ARM-compatible sandbox is in place. `CLIENT_URL` must be set to the exact origin users open (IP or domain), or the browser will block API requests via CORS.

AI diagrams use the server's `ANTHROPIC_API_KEY`, so on a public server every visitor's diagrams are billed to that key. Generating one can take over a minute, so [`my-app/nginx.conf`](my-app/nginx.conf) gives that one route (`/api/canvases/:id/architecture`) up to 3 minutes; every other `/api` route keeps nginx's default 60 seconds.

## Project Structure

```
free-form-Code/
├── backend/
│   ├── controllers/        # Route handlers (auth, canvas, blocks, run, architecture)
│   ├── routes/             # Express route definitions
│   ├── models/             # Database queries
│   ├── middleware/         # Auth, canvas access checks, request validation
│   ├── schemas/            # Zod request/socket schemas, and the AI's architecture contract
│   ├── services/           # GitHub repo reader, repo facts, the Claude call
│   ├── db/schema.sql       # Tables + idempotent migrations
│   ├── scripts/            # install-piston-languages.sh, generateArchitecture.ts (CLI)
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
│   │   ├── lib/            # languages, runCode, sockets, shape detection, diagram layout + placement
│   │   ├── API/            # Axios API calls
│   │   └── hooks/          # Custom React hooks
│   ├── nginx.conf          # Serves SPA + proxies /api and /socket.io to backend (longer wait for AI diagrams)
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

## Credits

The canvas uses two fonts from the [Excalidraw](https://excalidraw.com) project, bundled in [`my-app/src/assets/fonts/`](my-app/src/assets/fonts/) with their licenses:

| Font | Used for | Author | License |
|---|---|---|---|
| [Excalifont](https://github.com/excalidraw/excalidraw/tree/master/packages/excalidraw/fonts/Excalifont) (Latin subset) | Code blocks, run output, hand-drawn shapes' labels | Excalidraw — Your Own Font Foundry (Virgil), Ján Filípek / DizajnDesign | [SIL Open Font License 1.1](my-app/src/assets/fonts/Excalifont-LICENSE.txt) |
| [Comic Shanns](https://github.com/shannpersand/comic-shanns) v2 | Fallback for characters outside Excalifont's subset | Shannon Miwa | [MIT](my-app/src/assets/fonts/ComicShanns-LICENSE.txt) |

Code block syntax colors come from the [Beautiful Dracula](https://github.com/lamhoang1256/beautiful-dracula) VS Code theme (MIT): its exact colors in dark mode, and the same hues darkened for readability in light mode (`my-app/src/lib/codeTheme.ts`).

The code sandbox is [Piston](https://github.com/engineer-man/piston) by Engineer Man.

AI diagrams are laid out with [ELK](https://eclipse.dev/elk/) via [elkjs](https://github.com/kieler/elkjs) (EPL-2.0).
