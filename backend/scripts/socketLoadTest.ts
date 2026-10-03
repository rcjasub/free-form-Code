// Socket load test: N simulated users join one canvas and do what real
// collaborators do — move their cursors and drag blocks — while we time how
// long each block move takes to reach everyone else in the room.
//
// Not part of `npm test`; run it by hand against a local stack:
//   docker compose up -d                    (from the repo root)
//   npx ts-node scripts/socketLoadTest.ts   (from backend/)
//
// Options (env vars):
//   LOADTEST_URL      backend to hit           default http://localhost:4000
//   LOADTEST_USERS    comma-separated rounds   default 10,25,50,100
//   LOADTEST_SECONDS  length of each round     default 15
//   LOADTEST_CURSOR_HZ  cursor updates/sec per user   default 10
//
// Don't point this at production — the free VM is small and real users would
// feel it, and your home network's latency would muddy the numbers anyway.

import { io, type Socket } from "socket.io-client";
import { monitorEventLoopDelay } from "perf_hooks";

const URL = process.env.LOADTEST_URL ?? "http://localhost:4000";
const ROUNDS = (process.env.LOADTEST_USERS ?? "10,25,50,100").split(",").map(Number);
const SECONDS = Number(process.env.LOADTEST_SECONDS ?? 15);
const CURSOR_HZ = Number(process.env.LOADTEST_CURSOR_HZ ?? 10);
const PROBE_INTERVAL_MS = 500; // each user drags a block twice a second
const WARMUP_MS = 2000; // ignore the first moments while everyone settles in

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A throwaway guest account and its canvas, made public so the simulated
// users can join without logging in — same as visitors on a share link.
async function makeCanvas(): Promise<string> {
  const res = await fetch(`${URL}/api/auth/guest`, { method: "POST" });
  if (!res.ok) throw new Error(`guest signup failed (${res.status}) — is the backend running at ${URL}?`);
  const { canvasId } = (await res.json()) as { canvasId: string };
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";

  const pub = await fetch(`${URL}/api/canvases/${canvasId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ is_public: true }),
  });
  if (!pub.ok) throw new Error(`making the canvas public failed (${pub.status})`);
  return String(canvasId);
}

function connectUser(canvasId: string, n: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(URL, {
      transports: ["websocket"],
      auth: { guest: true, guestName: `load-${n}` },
      forceNew: true,
    });
    socket.on("connect_error", reject);
    socket.on("connect", () => {
      socket.emit("canvas:join", canvasId, (res: { ok: boolean; error?: string }) => {
        if (res.ok) resolve(socket);
        else reject(new Error(`canvas:join failed: ${res.error}`));
      });
    });
  });
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function runRound(users: number) {
  const canvasId = await makeCanvas();
  const sockets = await Promise.all(Array.from({ length: users }, (_, i) => connectUser(canvasId, i)));

  // Every probe carries a unique sequence number in `x`; since all users
  // live in this one process, one clock times the send and every receipt.
  const sentAt = new Map<number, number>();
  const latencies: number[] = [];
  let seq = 0;
  let probesSent = 0;
  let measuring = false;

  for (const s of sockets) {
    s.on("block:moved", (data: { x: number }) => {
      const t = sentAt.get(data.x);
      if (t !== undefined && measuring) latencies.push(performance.now() - t);
    });
    s.on("cursor:move", () => {}); // received like a real client, just not timed
  }

  // The load generator itself can become the bottleneck — if this process's
  // event loop is lagging, latency numbers are measuring us, not the server.
  const loopDelay = monitorEventLoopDelay({ resolution: 10 });
  loopDelay.enable();

  const timers: NodeJS.Timeout[] = [];
  sockets.forEach((s, i) => {
    // stagger start times so users don't all fire in lockstep
    const offset = Math.random() * PROBE_INTERVAL_MS;
    timers.push(
      setInterval(() => {
        s.emit("cursor:move", canvasId, { x: Math.random() * 1000, y: Math.random() * 1000 });
      }, 1000 / CURSOR_HZ),
    );
    setTimeout(() => {
      timers.push(
        setInterval(() => {
          const id = ++seq;
          sentAt.set(id, performance.now());
          if (measuring) probesSent++;
          s.emit("block:moved", canvasId, { id: `load-block-${i}`, x: id, y: 0 });
        }, PROBE_INTERVAL_MS),
      );
    }, offset);
  });

  await sleep(WARMUP_MS);
  measuring = true;
  loopDelay.reset();
  await sleep(SECONDS * 1000);
  measuring = false;
  await sleep(1000); // let in-flight messages land

  timers.forEach(clearInterval);
  loopDelay.disable();
  sockets.forEach((s) => s.disconnect());

  latencies.sort((a, b) => a - b);
  const expected = probesSent * (users - 1); // each probe should reach everyone else
  const fanoutPerSec = Math.round(users * (users - 1) * (CURSOR_HZ + 1000 / PROBE_INTERVAL_MS));
  return {
    users,
    "p50 ms": +percentile(latencies, 50).toFixed(1),
    "p95 ms": +percentile(latencies, 95).toFixed(1),
    "p99 ms": +percentile(latencies, 99).toFixed(1),
    "max ms": +(latencies[latencies.length - 1] ?? NaN).toFixed(1),
    delivered: `${((latencies.length / Math.max(expected, 1)) * 100).toFixed(1)}%`,
    "msgs/sec out": fanoutPerSec,
    "client lag p99 ms": +(loopDelay.percentile(99) / 1e6).toFixed(1),
  };
}

async function main() {
  console.log(`Load testing ${URL} — ${SECONDS}s per round, ${CURSOR_HZ} cursor updates/sec per user\n`);
  const results = [];
  for (const users of ROUNDS) {
    process.stdout.write(`  ${users} users... `);
    const r = await runRound(users);
    console.log(`p95 ${r["p95 ms"]}ms`);
    results.push(r);
    await sleep(1000);
  }
  console.log();
  console.table(results);
  console.log(
    "\n'msgs/sec out' is what the server broadcasts: every user's updates go to every other user." +
      "\nIf 'client lag p99' climbs past ~50ms, this script is the bottleneck — treat that round's latency as an upper bound." +
      "\n(~15ms of lag is normal on Windows, whose timers tick about every 15ms.)",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
