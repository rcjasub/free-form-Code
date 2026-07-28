import { Worker } from "bullmq";
import { Server } from "socket.io";
import vm from "vm";
import redis from "./redis";

export function startWorker(io: Server) {
  new Worker(
    "code-execution",
    async (job) => {
      const { code, socketId } = job.data;

      const logs: string[] = [];
      const sandbox = {
        console: {
          log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
          error: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
        },
      };

      try {
        vm.runInNewContext(code, sandbox, { timeout: 3000 });
        io.to(socketId).emit("run:complete", {
          output: logs.join("\n") || "(no output)",
        });
      } catch (err) {
        io.to(socketId).emit("run:complete", {
          output: (err as Error).message,
          error: true,
        });
      }
    },
    { connection: redis },
  );
}
