import { Request, Response } from "express";
import { codeQueue } from "../queue";

// Body is already checked by runSchema (see routes/run.ts).
export async function runCode(req: Request, res: Response): Promise<void> {
  const { code, language, socketId } = req.body;

  const job = await codeQueue.add("run", { code, language, socketId });
  res.json({ jobId: job.id });
}
