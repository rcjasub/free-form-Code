import { Request, Response } from "express";
import { codeQueue } from "../queue";

export async function runCode(req: Request, res: Response): Promise<void> {
  const { code, language = "javascript", socketId } = req.body;

  if (!code) {
    res.status(400).json({ error: "No code provided" });
    return;
  }
  if (!socketId) {
    res.status(400).json({ error: "No socketId provided" });
    return;
  }
  if (language !== "javascript") {
    res.status(400).json({ error: `Language "${language}" not supported yet` });
    return;
  }

  const job = await codeQueue.add("run", { code, socketId });
  res.json({ jobId: job.id });
}
