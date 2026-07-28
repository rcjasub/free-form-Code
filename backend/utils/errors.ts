import { Response } from "express";

// Logs the real error server-side but never forwards internals (e.g. raw
// Postgres constraint messages) to the client.
export function handleServerError(res: Response, err: unknown): void {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
