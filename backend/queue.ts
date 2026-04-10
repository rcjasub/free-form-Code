import { Queue } from "bullmq";
import redis from "./redis";

export const codeQueue = new Queue("code-execution", { connection: redis });
