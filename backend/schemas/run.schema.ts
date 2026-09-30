import { z } from "zod";
import { LANGUAGES, Language } from "../sandbox";

export const runSchema = z.object({
  code: z.string().min(1, "No code provided").max(20000, "Code is too long"),
  language: z
    .enum(Object.keys(LANGUAGES) as [Language, ...Language[]])
    .default("javascript"),
  socketId: z.string().min(1, "No socketId provided"),
  // Echoed back with the result so the client can match output to the run
  // that produced it when several are in flight.
  runId: z.string().max(64).optional(),
});
