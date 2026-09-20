import { Queue } from "bullmq";
import { bullConnection } from "./redis";

export const codeQueue = new Queue("code-execution", { connection: bullConnection });
