import { Request, Response } from "express";
import vm from "vm";

export async function runCode(req: Request, res: Response): Promise<void> {
  const { code, language = "javascript" } = req.body;

  if (!code) {
    res.status(400).json({ error: "No code provided" });
    return;
  }
  if (language !== "javascript") {
    res.status(400).json({ error: `Language "${language}" not supported yet` });
    return;
  }

  const logs: string[] = [];

  const sandbox = {
    console: {
      log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
      error: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
    },
  };

  try {
    vm.runInNewContext(code, sandbox, { timeout: 3000 });
    res.json({ output: logs.join("\n") || "(no output)" });
  } catch (err) {
    res.json({ output: (err as Error).message, error: true });
  }
}
