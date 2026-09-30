# Redis & Queues

## The problem

When a user clicks Run, the submitted code has to be executed somewhere. Without any protection, if 100 users click Run at the same time, the server tries to run 100 code executions simultaneously — maxing out CPU and RAM until it slows to a crawl or crashes.

## The solution: a job queue

Instead of running code inline, Express immediately adds the request to a queue and responds with an acknowledgement. A separate worker process pulls jobs from the queue one at a time (or a configurable number at a time) and handles the actual execution.

```
User clicks Run
      │
      ▼
Express adds job to queue → responds instantly ("job queued")
      │
      ▼
Queue: [job1, job2, job3, ...]
      │
      ▼
Worker picks up next job → sends it to the sandbox → emits result via Socket.io
      │
      ▼
User receives output in their browser
```

The queue holds the overflow. Adding a job to the queue is nearly free (just writing a small piece of data to Redis). The expensive part — running the code — is controlled by the worker at a safe pace.

## How the result gets back to the right user

Every browser that connects gets a unique `socketId`. When the user clicks Run, the frontend includes its own `socketId` in the request body. The worker stores this with the job, and when execution finishes it sends the result directly to that browser:

```ts
io.to(socketId).emit("run:complete", { output, error, runId });
```

`socketId` gets the result to the right **browser**. `runId` gets it to the right **run**: the frontend generates a random id for every run and only accepts the result that carries it back. Without it, two runs in flight at once could each grab whichever result arrived first and show output next to the wrong block.

## Where the code actually runs

The worker never executes user code itself. Earlier versions ran JavaScript with Node's `vm` module, which is **not a security boundary** — one line (`this.constructor.constructor("return process")()`) escapes it and reaches the backend's environment variables, database credentials and JWT secret.

Now the worker hands the code to [Piston](https://github.com/engineer-man/piston), a separate sandbox service (`backend/sandbox.ts`):

```
worker ──HTTP { language, code }──▶ Piston ──▶ isolated box per run
                                             (no network, 3s run limit,
                                              10s compile limit)
worker ◀──{ stdout, stderr, compile errors }──
```

If `PISTON_URL` isn't configured, `runInSandbox` returns "Code running isn't available yet." instead of running anything — so a server without a sandbox fails safe rather than falling back to something unsafe.

## Two separate concepts

### Queuing (used for code execution)
Manages work so the server isn't overwhelmed. Jobs are processed sequentially by a worker instead of all at once by Express.

### Caching (used for database reads)
Avoids doing the same work twice. A result is stored in Redis after the first fetch, so subsequent identical requests are served from memory instead of hitting the database.

```
First request  → Postgres (slow, ~50ms) → save result in Redis
Second request → Redis   (fast, ~1ms)
```

## Stack

- **Redis** — in-memory store that backs both the queue and cache
- **BullMQ** — library that manages the queue on top of Redis
- **ioredis** — the Redis client. BullMQ gets its own connection without a command timeout, because it issues long-blocking commands while waiting for jobs; the cache client uses a 2s timeout so a slow Redis falls back to Postgres instead of hanging requests
- **Piston** — the sandbox that actually runs the code

## Tradeoff

| | Without queue | With queue |
|---|---|---|
| Server under load | crashes | stays stable |
| User 1 | fast | fast |
| User 100 | fast (but server may crash) | waits in line, gets result |
