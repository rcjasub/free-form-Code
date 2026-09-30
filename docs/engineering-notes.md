# Engineering Notes

Problems I ran into while building free-form, what caused them, how I fixed them, and what I took away. Newest first. Each entry ends with a one-line version I can use when talking about it.

---

## 1. Sandboxing user code: the backend was one line away from being taken over

**Date:** 2026-09-30 · **Area:** security, infrastructure

**Problem.** Code blocks ran through a BullMQ worker that executed JavaScript with Node's `vm.runInNewContext`. `vm` looks like a sandbox but the Node docs say it isn't a security mechanism. One line escapes it:

```js
this.constructor.constructor("return process")().env
```

That returns the backend's environment: `JWT_SECRET` (forge a login for any user), database credentials (read or wipe everything), and a shell inside the backend container. `/api/run` didn't require login, and it was live on my deployed server.

**Constraints that shaped the fix.**
- Adding Python, C++ and Java meant code had to run *outside* Node anyway.
- My server is an Oracle Cloud free-tier **ARM** VM (Ampere A1, 4 cores / 24 GB).
- I wanted it free: no traffic yet, and a limited disk (44 GB).

**Options I weighed.**

| Option | Why not (for now) |
|---|---|
| Judge0 hosted API | Paid plans only (~€27/mo), and per-request overage charges mean a bot spamming Run could cost money |
| Judge0 self-hosted | Several GB of compilers for ~60 languages, needs cgroup v1, x86 only |
| Piston self-hosted on the VM | Official image has no ARM support (open GitHub issues since 2023) |
| Community ARM Piston image | Piston must run `privileged` (≈ root on the host) — not trusting that to an unknown maintainer |
| Build my own Docker runner | Right long-term answer, but security-sensitive; not the fastest way to close a live hole |

**What I shipped.**
- Deleted `vm` entirely. `sandbox.ts` sends code to **Piston** over HTTP; Piston runs each submission in an isolated box with **no network**, a 3s run limit and a 10s compile limit.
- **Fail-safe by default:** code running only works when `PISTON_URL` is set. On the VM it isn't, so Run answers "Code running isn't available yet." Forgetting a setting turns the feature *off*, never on.
- Piston runs locally via a Compose **profile** (`profiles: ["local"]`) so the ARM server never pulls it, bound to `127.0.0.1` so nobody can bypass the backend's rate limit.
- Verified with tests: the escape line now returns `undefined`, outbound network calls fail, infinite loops are killed at 3s.

**Takeaways.**
- "Isolated context" ≠ security boundary. Untrusted code belongs in a separate process/container with limits.
- Design config so the unsafe state is the one that's hard to reach.
- CPU architecture is a real deployment constraint — check it before choosing infrastructure.

**In one line:** *"I found a remote-code-execution hole in my code runner, closed it the same day by making execution fail-safe, and moved execution into a sandboxed service — choosing Piston after ruling out hosted Judge0 on cost-risk and self-hosting on ARM compatibility."*

---

## 2. IDOR: editing blocks on canvases you don't own

**Date:** 2026-09-30 · **Area:** security, API design

**Problem.** Block routes look like `PATCH /api/canvases/:id/blocks/:blockId/content`. Middleware checked that the caller could access canvas `:id`, but the query was `UPDATE blocks ... WHERE id = $blockId` — it never checked the block **belonged to that canvas**. Anyone with access to *any* canvas (even their own guest canvas) could edit or delete a block elsewhere by putting their canvas id in the URL and someone else's block id after it.

**Fix.** Every block write now matches both: `WHERE id = $1 AND canvas_id = $2`. A foreign block id returns 404 and nothing changes. Tests assert the canvas id is passed to the model, so the protection can't silently disappear.

**Why the risk was low (but real).** Block ids are random UUIDs and only sent to people already in that canvas's room.

**Takeaway.** Authorizing the parent isn't enough; check the child belongs to it. This class of bug is **IDOR** (Insecure Direct Object Reference) — one of the most common API vulnerabilities.

**In one line:** *"I found an IDOR where access was checked on the canvas but not on the block inside it, and fixed it by scoping every write query to the canvas the user was authorized for."*

---

## 3. Run results landing next to the wrong block

**Date:** 2026-09-30 · **Area:** real-time, concurrency

**Problem.** Runs are async: `POST /api/run` queues a job, and the result comes back later over Socket.IO. The canvas registered `socket.once("run:complete")` per run. With two runs in flight, **both** listeners fired on the first result, so output showed up next to the wrong block and the second result was lost. Separately, if the POST itself failed (rate limit, validation), no socket event ever came — the UI silently waited forever.

**Fix.** The client generates a `runId` per run and sends it; the worker echoes it back with the result; each run only accepts its own `runId`. A shared helper (`lib/runCode.ts`) also resolves with the HTTP error when the request is rejected, and times out after 30s so listeners can't leak. This replaced a FIFO queue on the shared-canvas page that assumed results arrive in order (true only while the worker processes one job at a time).

**Takeaway.** When request and response travel on different channels, correlate them explicitly with an id — don't rely on ordering or timing.

**In one line:** *"Async results over WebSockets were being matched to the wrong request under concurrency; I added request correlation ids end-to-end instead of relying on arrival order."*

---

## 4. Guest mode: trying the app without an account

**Date:** 2026-09-29 · **Area:** auth, data modeling

**Goal.** Let people try a canvas without signing up; signing up later should keep their work.

**Design choice.** Instead of a browser-only (localStorage) mode — which would need a second, offline version of the canvas and a messy migration at sign-up — a guest is a **real row in `users`** with `is_guest = true` and no email/password. All existing canvas, sharing and collaboration code works unchanged.

**Details that mattered.**
- **Upgrade in place.** On sign-up the guest's row is *updated* (`WHERE id = $1 AND is_guest = true`) instead of inserting a new user. The id never changes, so their canvas stays attached through the foreign key — no data migration.
- **Token vs cookie lifetime.** Guest JWTs last 30 days, but the shared cookie options had `maxAge: 24h` — the browser would have deleted the guest's only credential after a day. Guest cookies override `maxAge`.
- **JWTs are immutable.** After upgrading, the old token still says `isGuest: true`, so sign-up issues a new one.
- **Types caught a real bug.** Making `password_hash` nullable made TypeScript flag `bcrypt.compare(password, user.password_hash)`. The fix doubles as a rule: accounts with no password can never log in with one.
- **Limits live in the backend.** Guests get one canvas (403 on a second). The dashboard redirect for guests is UX only — anyone can call the API directly, so the rule that matters is enforced server-side.
- Adding `NOT NULL` changes to an existing DB: `CREATE TABLE IF NOT EXISTS` skips existing tables, so `schema.sql` also carries idempotent `ALTER TABLE ... IF NOT EXISTS` statements.

**In one line:** *"I modeled guests as real users with a flag so every feature worked for them for free, and upgraded them in place on sign-up so their data carried over without a migration."*

---

## 5. Password rules: why the max is 72

**Date:** 2026-09-29 · **Area:** auth

Passwords are hashed with bcrypt, which only uses the **first 72 bytes** of its input. A 100-character limit would have accepted passwords whose tail was silently ignored. The schema now enforces 8–72 characters (8 minimum follows NIST SP 800-63B), with custom messages instead of Zod's default "Too small: expected string to have >=8 characters".

**In one line:** *"I capped passwords at 72 because bcrypt ignores everything after 72 bytes."*

---

## 6. Local environment issues

Smaller problems, but good examples of reading errors carefully.

- **Redis `ECONNREFUSED ::1:6379` / `127.0.0.1:6379`.** The Redis container had been stopped for 10 days (exit 255 — Docker Desktop shut down without stopping it). Postgres came back, Redis didn't. `docker start redis` fixed it; ioredis reconnects on its own. The error listing both `::1` and `127.0.0.1` is Node trying IPv6 then IPv4 for `localhost`.
- **`EADDRINUSE :::4000`.** An old `ts-node server.ts` from a previous `npm run dev` was still holding port 4000. Found the PID with `netstat -ano | findstr :4000`. Lesson: stop dev servers with Ctrl+C rather than closing the terminal.
- **Vite `http proxy error ... ECONNREFUSED`** for a few seconds after a restart: just the frontend proxy trying to reach a backend that was still starting. Timestamps showed it matched the backend's start time — not a real problem.
- **`container name "/redis" is already in use`.** An existing `redis` container wasn't created by this Compose project; a hard-coded `container_name` collides across projects.
- **Separate Redis connection for BullMQ.** The cache client has a 2s `commandTimeout` so a slow Redis falls back to Postgres. BullMQ issues long-blocking commands while waiting for jobs, which that timeout would cut off, so it gets its own connection without one.

---

## 7. Moving off Railway

The app moved from Railway to an Oracle Cloud VM running Docker Compose. Cleanup: deleted both `railway.toml` files and the hard-coded Railway URL in the CORS allowlist — the allowed origin now comes only from `CLIENT_URL`, which must match exactly what users open (IP or domain), or the browser blocks requests.

---

## Open issues / next steps

- **Own ARM-compatible sandbox** so code runs in production: per-run containers from the official (multi-arch) Node/Python/GCC/Java images with `--network none`, memory/CPU/pid limits, read-only filesystem, non-root user — in a separate small service so the main backend never gets Docker access.
- **`NODE_ENV` isn't set** in the Dockerfile or Compose, so the auth cookie's `secure` flag is off in production.
- **Postgres has no named volume** in `docker-compose.yml`, so data isn't reliably kept across `docker compose down`.
- **`backend/node_modules` is committed to git** (711 files) despite `.gitignore` — needs `git rm -r --cached backend/node_modules`.
- **Cleanup job for stale guest accounts** (e.g. unused for 30 days) — a good fit for the existing BullMQ setup.
- Pre-existing lint errors in `FloatingNode.tsx` / `App.tsx` (refs during render, `deleteNode` used before declaration).
