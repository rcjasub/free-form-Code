import { Worker } from "bullmq";
import { Server } from "socket.io";
import { bullConnection } from "./redis";
import { runInSandbox } from "./sandbox";

export function startWorker(io: Server) {
  new Worker(
    "code-execution",
    async (job) => {
      // Jobs queued before multi-language support have no language field.
      const { code, language = "javascript", socketId, runId } = job.data;
      const result = await runInSandbox(language, code);
      io.to(socketId).emit("run:complete", { ...result, runId });
    },
    { connection: bullConnection },
  );
}
