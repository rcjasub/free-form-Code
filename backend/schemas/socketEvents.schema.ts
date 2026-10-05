import { z } from "zod";
import { contentSchema, languageSchema, linkSchema } from "./block.schema";

// Validates payloads relayed between clients over sockets. Unlike the REST
// schemas in block.schema.ts, these don't apply defaults — they're checking
// an already-formed object before it's trusted and rebroadcast to every
// other client in the room, not shaping a create/update request.
//
// Every field a client may relay is listed here, with the same rules as the
// REST routes: zod drops any key that isn't, so a socket event can't carry a
// field (e.g. a "javascript:" link) that the REST validation would reject.
const blockId = z.string().max(64);

export const blockCreatedEventSchema = z.object({
  id: blockId,
  x: z.number(),
  y: z.number(),
  content: contentSchema,
  type: z.enum(["text", "code", "draw", "image"]).optional(),
  language: languageSchema.optional(),
  width: z.number().positive().optional(),
  link: linkSchema.optional(),
});

export const blockMovedEventSchema = z.object({
  id: blockId,
  x: z.number(),
  y: z.number(),
});

export const blockUpdatedEventSchema = z.object({
  id: blockId,
  content: contentSchema,
  language: languageSchema.optional(),
  link: linkSchema.optional(),
});

export const blockDeletedEventSchema = blockId;

export const cursorMoveEventSchema = z.object({
  x: z.number(),
  y: z.number(),
});
