import { Queue, Worker } from "bullmq";
import { bullConnection, cacheDel } from "./redis";
import { deleteInactiveGuests } from "./models/users";
import { GUEST_TTL_DAYS } from "./middleware/auth";

// Once a day, deletes guests nobody has used for GUEST_TTL_DAYS, along with
// their canvases, blocks and share links. Every activity pushes the date back
// (keepGuestAlive in middleware/auth), and signing up stops being a guest.
const QUEUE = "maintenance";

export async function runGuestCleanup(): Promise<number> {
  const canvasIds = await deleteInactiveGuests(GUEST_TTL_DAYS);
  await Promise.all(canvasIds.map((id) => cacheDel(`blocks:${id}`)));
  return canvasIds.length;
}

export async function startGuestCleanup(): Promise<void> {
  // upsert, so restarts (or several servers) keep a single schedule
  await new Queue(QUEUE, { connection: bullConnection }).upsertJobScheduler(
    "guest-cleanup",
    { pattern: "0 4 * * *" }, // daily, 04:00 server time
    { name: "guest-cleanup" },
  );
  new Worker(
    QUEUE,
    async () => {
      const removed = await runGuestCleanup();
      console.log(`[cleanup] removed ${removed} idle guest canvas(es)`);
    },
    { connection: bullConnection },
  );
}
