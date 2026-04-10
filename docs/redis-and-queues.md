# Redis & Queues

## The problem

When a user clicks Run, the server executes their code. Without any protection, if 100 users click Run at the same time, the server tries to run 100 code executions simultaneously — maxing out CPU and RAM until it slows to a crawl or crashes.

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
Worker picks up next job → runs the code → emits result via Socket.io
      │
      ▼
User receives output in their browser
```

The queue holds the overflow. Adding a job to the queue is nearly free (just writing a small piece of data to Redis). The expensive part — running the code — is controlled by the worker at a safe pace.

## How the result gets back to the right user

Every browser that connects gets a unique `socketId`. When the user clicks Run, the frontend includes its own `socketId` in the request body. The worker stores this with the job, and when execution finishes it sends the result directly to that browser:

```ts
io.to(socketId).emit("run:complete", { output });
```

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
- **ioredis** — the Redis client used by BullMQ to connect

## Tradeoff

| | Without queue | With queue |
|---|---|---|
| Server under load | crashes | stays stable |
| User 1 | fast | fast |
| User 100 | fast (but server may crash) | waits in line, gets result |
